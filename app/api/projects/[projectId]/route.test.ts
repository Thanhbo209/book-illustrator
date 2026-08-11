import { rm } from "node:fs/promises";
import path from "node:path";
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCookieStore } from "@/tests/mocks/next-headers";

vi.mock("next/headers", () => import("@/tests/mocks/next-headers"));

import { GET } from "@/app/api/projects/[projectId]/route";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/storage/db";
import { createProject } from "@/lib/storage/projects";

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `project-detail-${crypto.randomUUID()}@test.dev` },
  });
}

function detailRequest(projectId: string) {
  return {
    request: new Request(`http://localhost/api/projects/${projectId}`),
    context: { params: Promise.resolve({ projectId }) },
  };
}

describe("GET /api/projects/:id", () => {
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
    const { request, context } = detailRequest("some-id");
    const response = await GET(request, context);
    expect(response.status).toBe(401);
  });

  it("returns the project detail for its owner", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);

    const project = await createProject({ userId: user.id, title: "Mine", bookText: "text" });
    projectIds.push(project.id);

    const { request, context } = detailRequest(project.id);
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    const { project: detail } = await response.json();
    expect(detail.bookText).toBe("text");
  });

  it("returns 404 for another user's project", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userIds.push(owner.id, intruder.id);

    const project = await createProject({ userId: owner.id, title: "Private", bookText: "text" });
    projectIds.push(project.id);

    await createSession(intruder.id);
    const { request, context } = detailRequest(project.id);
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it("returns 404 for a nonexistent project", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);

    const { request, context } = detailRequest("does-not-exist");
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });
});
