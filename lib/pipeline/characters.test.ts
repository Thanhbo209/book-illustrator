// @vitest-environment node
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini/service", () => ({
  generateCharacters: vi.fn(),
}));

import { generateCharacters } from "@/lib/gemini/service";
import { GeminiApiError } from "@/lib/gemini/errors";
import { prisma } from "@/lib/storage/db";
import { claimStep, completeStyleStep, createProject, getProjectForUser } from "@/lib/storage/projects";
import { runCharactersStep } from "@/lib/pipeline/characters";

const generateCharactersMock = vi.mocked(generateCharacters);

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `characters-step-${crypto.randomUUID()}@test.dev` },
  });
}

async function createProjectAtCharacters(userId: string) {
  const project = await createProject({ userId, title: "T", bookText: "text" });
  await claimStep(project.id, userId, "STYLE");
  await completeStyleStep({
    projectId: project.id,
    style: "Watercolor",
    bookFileUri: "files/abc",
    bookFileExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    interactionId: "int-style",
  });
  return project;
}

describe("runCharactersStep", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    generateCharactersMock.mockReset();
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

  it("chains from the Style step's interaction id and persists the result", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtCharacters(user.id);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "CHARACTERS");

    generateCharactersMock.mockResolvedValue({
      characters: [
        { name: "Mole", prompt: "a small mole" },
        { name: "Rat", prompt: "a water rat" },
      ],
      interactionId: "int-characters",
    });

    await runCharactersStep(project.id);

    expect(generateCharactersMock).toHaveBeenCalledWith({ previousInteractionId: "int-style" });

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("PORTRAITS");
    expect(detail?.stepState).toBe("IDLE");
    expect(detail?.characters).toHaveLength(2);
  });

  it("persists a FAILED state with a safe message when Gemini errors, without advancing", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtCharacters(user.id);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "CHARACTERS");

    generateCharactersMock.mockRejectedValue(new GeminiApiError("quota exceeded", "too_many_requests"));

    await runCharactersStep(project.id);

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("CHARACTERS");
    expect(detail?.stepState).toBe("FAILED");
    expect(detail?.stepError).toBe("quota exceeded");
    expect(detail?.characters).toEqual([]);
  });

  it("never throws — always resolves to a terminal state even on unexpected errors", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProjectAtCharacters(user.id);
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "CHARACTERS");

    generateCharactersMock.mockRejectedValue(new Error("internal detail: /some/path"));

    await expect(runCharactersStep(project.id)).resolves.toBeUndefined();

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.stepState).toBe("FAILED");
    expect(detail?.stepError).not.toContain("/some/path");
  });
});
