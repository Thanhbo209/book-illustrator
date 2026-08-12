// @vitest-environment node
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini/service", () => ({
  generatePortrait: vi.fn(),
}));

import { generatePortrait } from "@/lib/gemini/service";
import { GeminiApiError } from "@/lib/gemini/errors";
import { prisma } from "@/lib/storage/db";
import {
  claimStep,
  completeCharactersStep,
  completeStyleStep,
  createProject,
  getProjectForUser,
} from "@/lib/storage/projects";
import { readImage } from "@/lib/storage/files";
import { runPortraitsStep } from "@/lib/pipeline/portraits";

const generatePortraitMock = vi.mocked(generatePortrait);

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `portraits-step-${crypto.randomUUID()}@test.dev` },
  });
}

async function createProjectAtPortraits(userId: string, characters: { name: string; prompt: string }[]) {
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
  await completeCharactersStep({ projectId: project.id, characters, interactionId: "int-characters" });
  return project;
}

describe("runPortraitsStep", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    generatePortraitMock.mockReset();
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

  it("generates and persists a portrait for every character, then advances to CHAPTERS", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtPortraits(user.id, [
      { name: "Mole", prompt: "a small mole" },
      { name: "Rat", prompt: "a water rat" },
    ]);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "PORTRAITS");

    generatePortraitMock.mockResolvedValue({
      image: { data: Buffer.from("fake-image-bytes").toString("base64"), mimeType: "image/jpeg" },
      interactionId: "int-portrait",
    });

    await runPortraitsStep(project.id);

    expect(generatePortraitMock).toHaveBeenCalledTimes(2);
    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("CHAPTERS");
    expect(detail?.stepState).toBe("IDLE");
    expect(detail?.characters.every((c) => c.portraitState === "COMPLETED")).toBe(true);
    // Real Gemini mimeType (jpeg, not png) drove the saved extension.
    expect(detail?.characters[0].portraitUrl).not.toBeNull();

    // Image was actually written to disk with the real bytes before COMPLETED.
    const project2 = await prisma.character.findFirstOrThrow({ where: { projectId: project.id, order: 1 } });
    const written = await readImage(project2.portraitPath!);
    expect(written.toString()).toBe("fake-image-bytes");
    expect(project2.portraitPath).toMatch(/\.jpg$/);
  });

  it("skips a character whose portrait is already COMPLETED (resumability)", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtPortraits(user.id, [
      { name: "Mole", prompt: "a small mole" },
      { name: "Rat", prompt: "a water rat" },
    ]);
    projectIds.push(project.id);
    const [first] = (await getProjectForUser(project.id, user.id))!.characters;
    await prisma.character.update({
      where: { id: first.id },
      data: { portraitState: "COMPLETED", portraitPath: "/already/done.png" },
    });
    await claimStep(project.id, user.id, "PORTRAITS");

    generatePortraitMock.mockResolvedValue({
      image: { data: Buffer.from("bytes").toString("base64"), mimeType: "image/png" },
      interactionId: "int-portrait",
    });

    await runPortraitsStep(project.id);

    // Only the second (non-completed) character should have triggered a call.
    expect(generatePortraitMock).toHaveBeenCalledTimes(1);
    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("CHAPTERS");
  });

  it("continues past one character's failure, persists the other, and fails the overall step", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtPortraits(user.id, [
      { name: "Mole", prompt: "a small mole" },
      { name: "Rat", prompt: "a water rat" },
    ]);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "PORTRAITS");

    generatePortraitMock
      .mockRejectedValueOnce(new GeminiApiError("quota exceeded", "too_many_requests"))
      .mockResolvedValueOnce({
        image: { data: Buffer.from("bytes").toString("base64"), mimeType: "image/png" },
        interactionId: "int-portrait",
      });

    await runPortraitsStep(project.id);

    expect(generatePortraitMock).toHaveBeenCalledTimes(2);
    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("PORTRAITS");
    expect(detail?.stepState).toBe("FAILED");
    const first = detail?.characters.find((c) => c.name === "Mole");
    const second = detail?.characters.find((c) => c.name === "Rat");
    expect(first?.portraitState).toBe("FAILED");
    expect(first?.portraitError).toBe("quota exceeded");
    expect(second?.portraitState).toBe("COMPLETED");
  });

  it("on retry, regenerates only the previously failed character", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtPortraits(user.id, [
      { name: "Mole", prompt: "a small mole" },
      { name: "Rat", prompt: "a water rat" },
    ]);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "PORTRAITS");
    generatePortraitMock
      .mockRejectedValueOnce(new GeminiApiError("quota exceeded"))
      .mockResolvedValueOnce({
        image: { data: Buffer.from("bytes").toString("base64"), mimeType: "image/png" },
        interactionId: "int-1",
      });
    await runPortraitsStep(project.id);
    generatePortraitMock.mockReset();

    // Retry: FAILED step is reclaimable.
    await claimStep(project.id, user.id, "PORTRAITS");
    generatePortraitMock.mockResolvedValue({
      image: { data: Buffer.from("retry-bytes").toString("base64"), mimeType: "image/png" },
      interactionId: "int-2",
    });

    await runPortraitsStep(project.id);

    // Only the one that was FAILED gets regenerated.
    expect(generatePortraitMock).toHaveBeenCalledTimes(1);
    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("CHAPTERS");
    expect(detail?.characters.every((c) => c.portraitState === "COMPLETED")).toBe(true);
  });

  it("wraps unexpected errors in a safe, generic message", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtPortraits(user.id, [{ name: "Mole", prompt: "a small mole" }]);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "PORTRAITS");

    generatePortraitMock.mockRejectedValue(new Error("ENOENT: /internal/secret/path"));

    await expect(runPortraitsStep(project.id)).resolves.toBeUndefined();

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.stepState).toBe("FAILED");
    const character = detail?.characters[0];
    expect(character?.portraitError).not.toContain("/internal/secret/path");
  });
});
