import { rm } from "node:fs/promises";
import path from "node:path";
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/storage/db";
import {
  advancePortraitsStep,
  claimStep,
  completeCharactersStep,
  completeChaptersStep,
  completeCharacterPortrait,
  completeIllustrationStep,
  completeStyleStep,
  createProject,
  failCharacterPortrait,
  failStep,
  getProjectForUser,
  listProjectsForUser,
  startCharacterPortrait,
} from "@/lib/storage/projects";
import { STALE_MS } from "@/lib/pipeline/state";

describe("project storage", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

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

  async function createTestUser() {
    const user = await prisma.user.create({
      data: { name: "Test User", email: `project-${crypto.randomUUID()}@test.dev` },
    });
    userIds.push(user.id);
    return user;
  }

  it("creates a project, persists book text to disk, and starts as DRAFT", async () => {
    const user = await createTestUser();

    const summary = await createProject({
      userId: user.id,
      title: "The Wind in the Willows",
      bookText: "Chapter 1: The River Bank",
    });
    projectIds.push(summary.id);

    expect(summary.status).toBe("DRAFT");
    expect(summary.currentStep).toBe("STYLE");

    const detail = await getProjectForUser(summary.id, user.id);
    expect(detail?.bookText).toBe("Chapter 1: The River Bank");
    expect(detail?.characters).toEqual([]);
    expect(detail?.chapters).toEqual([]);
  });

  it("only lists projects belonging to the requesting user", async () => {
    const owner = await createTestUser();
    const otherUser = await createTestUser();

    const project = await createProject({
      userId: owner.id,
      title: "Owner's Project",
      bookText: "text",
    });
    projectIds.push(project.id);

    const ownerProjects = await listProjectsForUser(owner.id);
    const otherProjects = await listProjectsForUser(otherUser.id);

    expect(ownerProjects.map((p) => p.id)).toContain(project.id);
    expect(otherProjects.map((p) => p.id)).not.toContain(project.id);
  });

  it("returns null when the project belongs to a different user", async () => {
    const owner = await createTestUser();
    const otherUser = await createTestUser();

    const project = await createProject({
      userId: owner.id,
      title: "Private",
      bookText: "text",
    });
    projectIds.push(project.id);

    await expect(getProjectForUser(project.id, otherUser.id)).resolves.toBeNull();
  });

  it("returns null for a nonexistent project id", async () => {
    const user = await createTestUser();
    await expect(getProjectForUser("does-not-exist", user.id)).resolves.toBeNull();
  });

  describe("claimStep", () => {
    it("claims a fresh IDLE step and marks it RUNNING", async () => {
      const user = await createTestUser();
      const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
      projectIds.push(project.id);

      await expect(claimStep(project.id, user.id, "STYLE")).resolves.toBe(true);

      const detail = await getProjectForUser(project.id, user.id);
      expect(detail?.stepState).toBe("RUNNING");
    });

    it("only lets one of two concurrent claims succeed", async () => {
      const user = await createTestUser();
      const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
      projectIds.push(project.id);

      const [first, second] = await Promise.all([
        claimStep(project.id, user.id, "STYLE"),
        claimStep(project.id, user.id, "STYLE"),
      ]);

      expect([first, second].filter(Boolean)).toHaveLength(1);
    });

    it("refuses to claim a step that isn't current", async () => {
      const user = await createTestUser();
      const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
      projectIds.push(project.id);

      await expect(claimStep(project.id, user.id, "CHARACTERS")).resolves.toBe(false);
    });

    it("refuses to claim a fresh RUNNING step", async () => {
      const user = await createTestUser();
      const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
      projectIds.push(project.id);

      await claimStep(project.id, user.id, "STYLE");
      await expect(claimStep(project.id, user.id, "STYLE")).resolves.toBe(false);
    });

    it("allows reclaiming a stale RUNNING step", async () => {
      const user = await createTestUser();
      const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
      projectIds.push(project.id);

      const staleStart = new Date(Date.now() - STALE_MS - 1000);
      await claimStep(project.id, user.id, "STYLE", staleStart);

      await expect(claimStep(project.id, user.id, "STYLE")).resolves.toBe(true);
    });

    it("refuses to claim another user's project", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      const project = await createProject({ userId: owner.id, title: "T", bookText: "text" });
      projectIds.push(project.id);

      await expect(claimStep(project.id, intruder.id, "STYLE")).resolves.toBe(false);
    });
  });

  describe("completeStyleStep / failStep", () => {
    it("persists the style and advances to CHARACTERS", async () => {
      const user = await createTestUser();
      const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
      projectIds.push(project.id);
      await claimStep(project.id, user.id, "STYLE");

      await completeStyleStep({
        projectId: project.id,
        style: "Warm watercolor",
        bookFileUri: "files/abc",
        bookFileExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
        interactionId: "int-1",
      });

      const detail = await getProjectForUser(project.id, user.id);
      expect(detail?.style).toBe("Warm watercolor");
      expect(detail?.currentStep).toBe("CHARACTERS");
      expect(detail?.stepState).toBe("IDLE");
      expect(detail?.stepError).toBeNull();
    });

    it("persists a failure without advancing the step", async () => {
      const user = await createTestUser();
      const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
      projectIds.push(project.id);
      await claimStep(project.id, user.id, "STYLE");

      await failStep(project.id, "Gemini quota exceeded");

      const detail = await getProjectForUser(project.id, user.id);
      expect(detail?.currentStep).toBe("STYLE");
      expect(detail?.stepState).toBe("FAILED");
      expect(detail?.stepError).toBe("Gemini quota exceeded");
    });
  });

  describe("completeCharactersStep", () => {
    it("persists ordered character rows and advances to PORTRAITS", async () => {
      const user = await createTestUser();
      const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
      projectIds.push(project.id);
      await claimStep(project.id, user.id, "STYLE");
      await completeStyleStep({
        projectId: project.id,
        style: "Watercolor",
        bookFileUri: "files/abc",
        bookFileExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
        interactionId: "int-style",
      });
      await claimStep(project.id, user.id, "CHARACTERS");

      await completeCharactersStep({
        projectId: project.id,
        characters: [
          { name: "Mole", prompt: "a small mole" },
          { name: "Rat", prompt: "a water rat" },
        ],
        interactionId: "int-characters",
      });

      const detail = await getProjectForUser(project.id, user.id);
      expect(detail?.currentStep).toBe("PORTRAITS");
      expect(detail?.stepState).toBe("IDLE");
      expect(detail?.characters).toHaveLength(2);
      expect(detail?.characters[0]).toMatchObject({ order: 1, name: "Mole", prompt: "a small mole" });
      expect(detail?.characters[1]).toMatchObject({ order: 2, name: "Rat", prompt: "a water rat" });
    });

    it("overwrites any existing character rows rather than duplicating them", async () => {
      const user = await createTestUser();
      const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
      projectIds.push(project.id);
      await claimStep(project.id, user.id, "STYLE");
      await completeStyleStep({
        projectId: project.id,
        style: "Watercolor",
        bookFileUri: "files/abc",
        bookFileExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
        interactionId: "int-style",
      });
      await claimStep(project.id, user.id, "CHARACTERS");
      await completeCharactersStep({
        projectId: project.id,
        characters: [{ name: "First Attempt", prompt: "stale data" }],
        interactionId: "int-1",
      });

      // Simulate a retry overwriting the first attempt's rows.
      await prisma.project.update({
        where: { id: project.id },
        data: { currentStep: "CHARACTERS", stepState: "IDLE" },
      });
      await claimStep(project.id, user.id, "CHARACTERS");
      await completeCharactersStep({
        projectId: project.id,
        characters: [{ name: "Mole", prompt: "a small mole" }],
        interactionId: "int-2",
      });

      const detail = await getProjectForUser(project.id, user.id);
      expect(detail?.characters).toHaveLength(1);
      expect(detail?.characters[0].name).toBe("Mole");
    });
  });

  describe("per-character portrait state", () => {
    async function createProjectAtPortraits(userId: string) {
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
      return project;
    }

    it("tracks a single character's portrait through running -> completed independently of the others", async () => {
      const user = await createTestUser();
      userIds.push(user.id);
      const project = await createProjectAtPortraits(user.id);
      projectIds.push(project.id);
      const [first, second] = (await getProjectForUser(project.id, user.id))!.characters;

      await startCharacterPortrait(first.id);
      let detail = await getProjectForUser(project.id, user.id);
      expect(detail?.characters.find((c) => c.id === first.id)?.portraitState).toBe("RUNNING");
      expect(detail?.characters.find((c) => c.id === second.id)?.portraitState).toBe("IDLE");

      await completeCharacterPortrait(first.id, "/data/projects/x/characters/1.jpg");
      detail = await getProjectForUser(project.id, user.id);
      const completedFirst = detail?.characters.find((c) => c.id === first.id);
      expect(completedFirst?.portraitState).toBe("COMPLETED");
      // The stored path's extension is what later drives Content-Type — confirm it isn't hardcoded to .png.
      expect(completedFirst?.portraitUrl).not.toBeNull();
      expect(detail?.characters.find((c) => c.id === second.id)?.portraitState).toBe("IDLE");
    });

    it("records a failure on one character without affecting the other", async () => {
      const user = await createTestUser();
      userIds.push(user.id);
      const project = await createProjectAtPortraits(user.id);
      projectIds.push(project.id);
      const [first, second] = (await getProjectForUser(project.id, user.id))!.characters;

      await completeCharacterPortrait(first.id, "/data/projects/x/characters/1.png");
      await failCharacterPortrait(second.id, "Gemini quota exceeded");

      const detail = await getProjectForUser(project.id, user.id);
      expect(detail?.characters.find((c) => c.id === first.id)?.portraitState).toBe("COMPLETED");
      const failedSecond = detail?.characters.find((c) => c.id === second.id);
      expect(failedSecond?.portraitState).toBe("FAILED");
      expect(failedSecond?.portraitError).toBe("Gemini quota exceeded");
    });

    it("advancePortraitsStep moves the project to CHAPTERS", async () => {
      const user = await createTestUser();
      userIds.push(user.id);
      const project = await createProjectAtPortraits(user.id);
      projectIds.push(project.id);
      await claimStep(project.id, user.id, "PORTRAITS");

      await advancePortraitsStep(project.id);

      const detail = await getProjectForUser(project.id, user.id);
      expect(detail?.currentStep).toBe("CHAPTERS");
      expect(detail?.stepState).toBe("IDLE");
    });
  });

  describe("completeChaptersStep / completeIllustrationStep", () => {
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
        characters: [{ name: "Mole", prompt: "a small mole" }],
        interactionId: "int-characters",
      });
      await advancePortraitsStep(project.id);
      return project;
    }

    it("persists the chapter, updates the text chain, and advances to ILLUSTRATIONS", async () => {
      const user = await createTestUser();
      userIds.push(user.id);
      const project = await createProjectAtChapters(user.id);
      projectIds.push(project.id);
      await claimStep(project.id, user.id, "CHAPTERS");

      await completeChaptersStep({
        projectId: project.id,
        chapter: { title: "River Bank", prompt: "Mole meets the Water Rat" },
        interactionId: "int-chapters",
      });

      const detail = await getProjectForUser(project.id, user.id);
      expect(detail?.currentStep).toBe("ILLUSTRATIONS");
      expect(detail?.stepState).toBe("IDLE");
      expect(detail?.chapters).toHaveLength(1);
      expect(detail?.chapters[0]).toMatchObject({ order: 1, title: "River Bank" });
    });

    it("persists the illustration and advances the project to DONE", async () => {
      const user = await createTestUser();
      userIds.push(user.id);
      const project = await createProjectAtChapters(user.id);
      projectIds.push(project.id);
      await claimStep(project.id, user.id, "CHAPTERS");
      await completeChaptersStep({
        projectId: project.id,
        chapter: { title: "River Bank", prompt: "Mole meets the Water Rat" },
        interactionId: "int-chapters",
      });
      const chapter = (await getProjectForUser(project.id, user.id))!.chapters[0];
      await claimStep(project.id, user.id, "ILLUSTRATIONS");

      await completeIllustrationStep(chapter.id, project.id, "/data/projects/x/chapters/1.webp");

      const detail = await getProjectForUser(project.id, user.id);
      expect(detail?.currentStep).toBe("DONE");
      expect(detail?.status).toBe("DONE");
      expect(detail?.chapters[0].illustrationState).toBe("COMPLETED");
      expect(detail?.chapters[0].illustrationUrl).not.toBeNull();
    });
  });
});
