// @vitest-environment node
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCookieStore } from "@/tests/mocks/next-headers";

vi.mock("next/headers", () => import("@/tests/mocks/next-headers"));
vi.mock("@/lib/gemini/service", () => ({
  uploadBookText: vi.fn(),
  generateStyle: vi.fn(),
}));

import { POST } from "@/app/api/projects/[projectId]/steps/style/route";
import { generateStyle, uploadBookText } from "@/lib/gemini/service";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/storage/db";
import { createProject } from "@/lib/storage/projects";

const uploadBookTextMock = vi.mocked(uploadBookText);
const generateStyleMock = vi.mocked(generateStyle);

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `style-route-${crypto.randomUUID()}@test.dev` },
  });
}

function postRequest(projectId: string, body: unknown) {
  return {
    request: new Request(`http://localhost/api/projects/${projectId}/steps/style`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    context: { params: Promise.resolve({ projectId }) },
  };
}

describe("POST /api/projects/:id/steps/style", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    resetCookieStore();
    uploadBookTextMock.mockReset();
    generateStyleMock.mockReset();
    uploadBookTextMock.mockResolvedValue({
      uri: "files/abc",
      mimeType: "text/plain",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
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
    const { request, context } = postRequest("some-id", {});
    const response = await POST(request, context);
    expect(response.status).toBe(401);
    expect(generateStyleMock).not.toHaveBeenCalled();
  });

  it("runs the step and returns the completed project", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    generateStyleMock.mockResolvedValue({ style: "Warm watercolor", interactionId: "int-1" });

    const { request, context } = postRequest(project.id, {});
    const response = await POST(request, context);

    expect(response.status).toBe(200);
    const { project: body } = await response.json();
    expect(body.style).toBe("Warm watercolor");
    expect(body.currentStep).toBe("CHARACTERS");
    expect(generateStyleMock).toHaveBeenCalledTimes(1);
  });

  it("returns 409 and skips Gemini entirely on a duplicate concurrent request", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);

    // Simulate a step already RUNNING (as if another request claimed it moments ago).
    await prisma.project.update({
      where: { id: project.id },
      data: { stepState: "RUNNING", stepStartedAt: new Date() },
    });

    const { request, context } = postRequest(project.id, {});
    const response = await POST(request, context);

    expect(response.status).toBe(409);
    expect(generateStyleMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input before claiming the step", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);

    const { request, context } = postRequest(project.id, { style: "" });
    const response = await POST(request, context);

    expect(response.status).toBe(400);
    expect(generateStyleMock).not.toHaveBeenCalled();

    const stillIdle = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(stillIdle.stepState).toBe("IDLE");
  });

  it("returns 404 for another user's project", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userIds.push(owner.id, intruder.id);
    const project = await createProject({ userId: owner.id, title: "T", bookText: "text" });
    projectIds.push(project.id);

    await createSession(intruder.id);
    const { request, context } = postRequest(project.id, {});
    const response = await POST(request, context);

    expect(response.status).toBe(404);
    expect(generateStyleMock).not.toHaveBeenCalled();
  });

  it("persists a retryable FAILED state when Gemini errors", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    generateStyleMock.mockRejectedValue(new Error("boom"));

    const { request, context } = postRequest(project.id, {});
    const response = await POST(request, context);

    expect(response.status).toBe(200);
    const { project: body } = await response.json();
    expect(body.stepState).toBe("FAILED");
    expect(body.currentStep).toBe("STYLE");

    // Retry: claim should succeed again since the step is now FAILED, not RUNNING.
    generateStyleMock.mockResolvedValue({ style: "Recovered style", interactionId: "int-2" });
    const retry = postRequest(project.id, {});
    const retryResponse = await POST(retry.request, retry.context);
    expect(retryResponse.status).toBe(200);
    const { project: retryBody } = await retryResponse.json();
    expect(retryBody.style).toBe("Recovered style");
  });
});
