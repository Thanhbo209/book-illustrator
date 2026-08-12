// @vitest-environment node
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini/service", () => ({
  generateChapters: vi.fn(),
}));

import { generateChapters } from "@/lib/gemini/service";
import { GeminiApiError } from "@/lib/gemini/errors";
import { prisma } from "@/lib/storage/db";
import {
  advancePortraitsStep,
  claimStep,
  completeCharactersStep,
  completeStyleStep,
  createProject,
  getProjectForUser,
} from "@/lib/storage/projects";
import { runChaptersStep } from "@/lib/pipeline/chapters";

const generateChaptersMock = vi.mocked(generateChapters);

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `chapters-step-${crypto.randomUUID()}@test.dev` },
  });
}

async function createProjectAtChapters(userId: string) {
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
  await advancePortraitsStep(project.id);
  return project;
}

describe("runChaptersStep", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    generateChaptersMock.mockReset();
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

  it("chains from the Characters step's interaction id (skipping Portraits) and persists the result", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtChapters(user.id);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "CHAPTERS");

    generateChaptersMock.mockResolvedValue({
      chapters: [{ title: "River Bank", prompt: "Mole and Rat share a picnic by the river" }],
      interactionId: "int-chapters",
    });

    await runChaptersStep(project.id);

    // lastInteractionId still points at Characters' own interaction —
    // Portraits never touched it (independent image calls, Option C).
    expect(generateChaptersMock).toHaveBeenCalledWith({
      previousInteractionId: "int-characters",
      characters: [{ name: "Mole" }, { name: "Rat" }],
    });

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("ILLUSTRATIONS");
    expect(detail?.stepState).toBe("IDLE");
    expect(detail?.chapters).toHaveLength(1);
    expect(detail?.chapters[0]).toMatchObject({ order: 1, title: "River Bank" });
  });

  it("persists a FAILED state with a safe message when Gemini errors, without advancing", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtChapters(user.id);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "CHAPTERS");

    generateChaptersMock.mockRejectedValue(new GeminiApiError("quota exceeded", "too_many_requests"));

    await runChaptersStep(project.id);

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("CHAPTERS");
    expect(detail?.stepState).toBe("FAILED");
    expect(detail?.stepError).toBe("quota exceeded");
    expect(detail?.chapters).toEqual([]);
  });

  it("never throws — always resolves to a terminal state even on unexpected errors", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtChapters(user.id);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "CHAPTERS");

    generateChaptersMock.mockRejectedValue(new Error("internal detail: /some/path"));

    await expect(runChaptersStep(project.id)).resolves.toBeUndefined();

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.stepState).toBe("FAILED");
    expect(detail?.stepError).not.toContain("/some/path");
  });
});
