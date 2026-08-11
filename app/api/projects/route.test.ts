import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCookieStore } from "@/tests/mocks/next-headers";

vi.mock("next/headers", () => import("@/tests/mocks/next-headers"));

import { GET, POST } from "@/app/api/projects/route";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/storage/db";

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `projects-route-${crypto.randomUUID()}@test.dev` },
  });
}

function postFormRequest(fields: Record<string, string | Blob>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/projects", { method: "POST", body: formData });
}

describe("/api/projects", () => {
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

  it("rejects GET without a session", async () => {
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("rejects POST without a session", async () => {
    const response = await POST(postFormRequest({ title: "X", bookText: "text" }));
    expect(response.status).toBe(401);
  });

  it("creates a project from pasted text and lists it back", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);

    const createResponse = await POST(
      postFormRequest({ title: "My Book", bookText: "Once upon a time." }),
    );
    expect(createResponse.status).toBe(201);
    const { project } = await createResponse.json();
    projectIds.push(project.id);
    expect(project.title).toBe("My Book");
    expect(project.status).toBe("DRAFT");

    const listResponse = await GET();
    const { projects } = await listResponse.json();
    expect(projects.map((p: { id: string }) => p.id)).toContain(project.id);
  });

  it("creates a project from an uploaded .txt file", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);

    const file = new File(["Uploaded book content"], "book.txt", { type: "text/plain" });
    const response = await POST(postFormRequest({ title: "Uploaded", file }));
    expect(response.status).toBe(201);
    const { project } = await response.json();
    projectIds.push(project.id);
    expect(project.title).toBe("Uploaded");
  });

  it("rejects a non-.txt upload", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);

    const file = new File(["not text"], "book.pdf", { type: "application/pdf" });
    const response = await POST(postFormRequest({ title: "Bad", file }));
    expect(response.status).toBe(400);
  });

  it("rejects a request with neither pasted text nor a file", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);

    const response = await POST(postFormRequest({ title: "Empty" }));
    expect(response.status).toBe(400);
  });
});
