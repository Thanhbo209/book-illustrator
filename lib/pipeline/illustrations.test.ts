// @vitest-environment node
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini/service", () => ({
  generateIllustration: vi.fn(),
}));

import { generateIllustration } from "@/lib/gemini/service";
import { GeminiApiError } from "@/lib/gemini/errors";
import { prisma } from "@/lib/storage/db";
import {
  advancePortraitsStep,
  claimStep,
  completeChaptersStep,
  completeCharacterPortrait,
  completeCharactersStep,
  completeStyleStep,
  createProject,
  getProjectForUser,
} from "@/lib/storage/projects";
import { characterPortraitPath, readImage, writeImage } from "@/lib/storage/files";
import { runIllustrationsStep } from "@/lib/pipeline/illustrations";

const generateIllustrationMock = vi.mocked(generateIllustration);

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `illustrations-step-${crypto.randomUUID()}@test.dev` },
  });
}

async function createProjectAtIllustrations(userId: string) {
  const project = await createProject({ userId, title: "T", bookText: "text" });
  await claimStep(project.id, userId, "STYLE");
  await completeStyleStep({
    projectId: project.id,
    style: "Watercolor",
    bookFileUri: "files/abc",
    bookFileExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    interactionId: "int-style",
  });
  await claimStep(project.id, userId, "CHARACTERS");
  await completeCharactersStep({
    projectId: project.id,
    characters: [
      { name: "Mole", prompt: "a small mole" },
      { name: "Rat", prompt: "a water rat" },
    ],
    interactionId: "int-characters",
  });

  const detail = await getProjectForUser(project.id, userId);
  for (const character of detail!.characters) {
    const filePath = characterPortraitPath(project.id, character.order, "image/jpeg");
    await writeImage(filePath, Buffer.from(`portrait-${character.order}`));
    await completeCharacterPortrait(character.id, filePath);
  }
  await advancePortraitsStep(project.id);

  await claimStep(project.id, userId, "CHAPTERS");
  await completeChaptersStep({
    projectId: project.id,
    chapter: { title: "River Bank", prompt: "Mole and Rat share a picnic by the river" },
    interactionId: "int-chapters",
  });

  return project;
}

describe("runIllustrationsStep", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    generateIllustrationMock.mockReset();
  });

  afterEach(async () => {
    while (projectIds.length) {
      const id = projectIds.pop()!;
      await prisma.project.deleteMany({ where: { id } });
      await rm(path.join(process.cwd(), "data", "projects", id), {
        recursive: true,
        force: true,
      });
    }
    while (userIds.length) {
      const id = userIds.pop()!;
      await prisma.user.deleteMany({ where: { id } });
    }
  });

  it("passes persisted portraits as references, persists the image, and advances to DONE", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtIllustrations(user.id);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "ILLUSTRATIONS");

    generateIllustrationMock.mockResolvedValue({
      image: { data: Buffer.from("illustration-bytes").toString("base64"), mimeType: "image/webp" },
      interactionId: "int-illustration",
    });

    await runIllustrationsStep(project.id);

    const call = generateIllustrationMock.mock.calls[0][0];
    expect(call.chapter).toEqual({ title: "River Bank", prompt: "Mole and Rat share a picnic by the river" });
    expect(call.style).toBe("Watercolor");
    expect(call.characterPortraits).toHaveLength(2);
    expect(call.characterPortraits[0]).toMatchObject({ name: "Mole", mimeType: "image/jpeg" });
    expect(Buffer.from(call.characterPortraits[0].data, "base64").toString()).toBe("portrait-1");

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("DONE");
    expect(detail?.status).toBe("DONE");
    expect(detail?.chapters[0].illustrationState).toBe("COMPLETED");
    expect(detail?.chapters[0].illustrationUrl).not.toBeNull();

    const chapterRow = await prisma.chapter.findFirstOrThrow({ where: { projectId: project.id } });
    expect(chapterRow.illustrationPath).toMatch(/\.webp$/);
    const written = await readImage(chapterRow.illustrationPath!);
    expect(written.toString()).toBe("illustration-bytes");
  });

  it("persists a FAILED state with a safe message when Gemini errors, without advancing", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtIllustrations(user.id);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "ILLUSTRATIONS");

    generateIllustrationMock.mockRejectedValue(new GeminiApiError("quota exceeded", "too_many_requests"));

    await runIllustrationsStep(project.id);

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("ILLUSTRATIONS");
    expect(detail?.stepState).toBe("FAILED");
    expect(detail?.stepError).toBe("quota exceeded");
    expect(detail?.chapters[0].illustrationState).toBe("IDLE");
  });

  it("never throws — always resolves to a terminal state even on unexpected errors", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtIllustrations(user.id);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "ILLUSTRATIONS");

    generateIllustrationMock.mockRejectedValue(new Error("internal detail: /some/path"));

    await expect(runIllustrationsStep(project.id)).resolves.toBeUndefined();

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.stepState).toBe("FAILED");
    expect(detail?.stepError).not.toContain("/some/path");
  });
});
