import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/storage/db";
import { createProject, getProjectForUser, listProjectsForUser } from "@/lib/storage/projects";

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
});
