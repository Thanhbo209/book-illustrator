// @vitest-environment node
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCookieStore } from "@/tests/mocks/next-headers";

vi.mock("next/headers", () => import("@/tests/mocks/next-headers"));

import { GET } from "@/app/api/projects/[projectId]/image/[kind]/[refId]/route";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/storage/db";
import { createProject } from "@/lib/storage/projects";
import { characterPortraitPath, chapterIllustrationPath, writeImage } from "@/lib/storage/files";

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `image-route-${crypto.randomUUID()}@test.dev` },
  });
}

function imageRequest(projectId: string, kind: string, refId: string) {
  return {
    request: new Request(`http://localhost/api/projects/${projectId}/image/${kind}/${refId}`),
    context: { params: Promise.resolve({ projectId, kind, refId }) },
  };
}

describe("GET /api/projects/:id/image/:kind/:refId", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    resetCookieStore();
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

  it("rejects an unauthenticated request", async () => {
    const { request, context } = imageRequest("some-id", "character", "1");
    const response = await GET(request, context);
    expect(response.status).toBe(401);
  });

  it("returns 404 for a nonexistent project", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);

    const { request, context } = imageRequest("does-not-exist", "character", "1");
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it("returns 404 (not 403) for another user's project — indistinguishable from missing", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userIds.push(owner.id, intruder.id);
    const project = await createProject({ userId: owner.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    const filePath = characterPortraitPath(project.id, 1, "image/png");
    await writeImage(filePath, Buffer.from("fake-png-bytes"));
    await prisma.character.create({
      data: {
        projectId: project.id,
        order: 1,
        name: "Mole",
        prompt: "a mole",
        portraitState: "COMPLETED",
        portraitPath: filePath,
      },
    });

    await createSession(intruder.id);
    const { request, context } = imageRequest(project.id, "character", "1");
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it("rejects an invalid kind", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);

    const { request, context } = imageRequest(project.id, "book", "1");
    const response = await GET(request, context);
    expect(response.status).toBe(400);
  });

  it.each(["0", "-1", "abc", "1.5"])("rejects an invalid refId %s", async (refId) => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);

    const { request, context } = imageRequest(project.id, "character", refId);
    const response = await GET(request, context);
    expect(response.status).toBe(400);
  });

  it("returns 404 when no character exists at that order", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);

    const { request, context } = imageRequest(project.id, "character", "1");
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it("returns 404 when the character exists but has no portrait yet", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    await prisma.character.create({
      data: { projectId: project.id, order: 1, name: "Mole", prompt: "a mole" },
    });

    const { request, context } = imageRequest(project.id, "character", "1");
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it("returns 404 when the row points at a file that no longer exists on disk", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    await prisma.character.create({
      data: {
        projectId: project.id,
        order: 1,
        name: "Mole",
        prompt: "a mole",
        portraitState: "COMPLETED",
        portraitPath: characterPortraitPath(project.id, 1, "image/png"),
      },
    });

    const { request, context } = imageRequest(project.id, "character", "1");
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it("serves a character portrait with the correct bytes and Content-Type derived from the real extension", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    // image/jpeg, not png — proves Content-Type isn't hardcoded (Decision #3).
    const filePath = characterPortraitPath(project.id, 1, "image/jpeg");
    const bytes = Buffer.from("fake-jpeg-bytes");
    await writeImage(filePath, bytes);
    await prisma.character.create({
      data: {
        projectId: project.id,
        order: 1,
        name: "Mole",
        prompt: "a mole",
        portraitState: "COMPLETED",
        portraitPath: filePath,
      },
    });

    const { request, context } = imageRequest(project.id, "character", "1");
    const response = await GET(request, context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    const returned = Buffer.from(await response.arrayBuffer());
    expect(returned.equals(bytes)).toBe(true);
  });

  it("serves a chapter illustration by the same route", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    const filePath = chapterIllustrationPath(project.id, 1, "image/webp");
    const bytes = Buffer.from("fake-webp-bytes");
    await writeImage(filePath, bytes);
    await prisma.chapter.create({
      data: {
        projectId: project.id,
        order: 1,
        title: "River Bank",
        prompt: "a scene",
        illustrationState: "COMPLETED",
        illustrationPath: filePath,
      },
    });

    const { request, context } = imageRequest(project.id, "chapter", "1");
    const response = await GET(request, context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
  });
});
