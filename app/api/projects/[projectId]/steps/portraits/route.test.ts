// @vitest-environment node
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCookieStore } from "@/tests/mocks/next-headers";

vi.mock("next/headers", () => import("@/tests/mocks/next-headers"));
vi.mock("@/lib/gemini/service", () => ({
  generatePortrait: vi.fn(),
}));

import { POST } from "@/app/api/projects/[projectId]/steps/portraits/route";
import { generatePortrait } from "@/lib/gemini/service";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/storage/db";
import { claimStep, completeCharactersStep, completeStyleStep, createProject } from "@/lib/storage/projects";

const generatePortraitMock = vi.mocked(generatePortrait);

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `portraits-route-${crypto.randomUUID()}@test.dev` },
  });
}

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
    characters: [{ name: "Mole", prompt: "a small mole" }],
    interactionId: "int-characters",
  });
  return project;
}

function postRequest(projectId: string) {
  return {
    request: new Request(`http://localhost/api/projects/${projectId}/steps/portraits`, {
      method: "POST",
    }),
    context: { params: Promise.resolve({ projectId }) },
  };
}

describe("POST /api/projects/:id/steps/portraits", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    resetCookieStore();
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

  it("rejects an unauthenticated request", async () => {
    const { request, context } = postRequest("some-id");
    const response = await POST(request, context);
    expect(response.status).toBe(401);
    expect(generatePortraitMock).not.toHaveBeenCalled();
  });

  it("runs the step and returns the completed project with a persisted portrait", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProjectAtPortraits(user.id);
    projectIds.push(project.id);
    generatePortraitMock.mockResolvedValue({
      image: { data: Buffer.from("bytes").toString("base64"), mimeType: "image/png" },
      interactionId: "int-portrait",
    });

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(200);
    const { project: body } = await response.json();
    expect(body.currentStep).toBe("CHAPTERS");
    expect(body.characters[0].portraitState).toBe("COMPLETED");
    expect(body.characters[0].portraitUrl).not.toBeNull();
    expect(generatePortraitMock).toHaveBeenCalledTimes(1);
  });

  it("cannot be triggered before Characters has completed", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(409);
    expect(generatePortraitMock).not.toHaveBeenCalled();
  });

  it("returns 409 and skips Gemini entirely on a duplicate concurrent request", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProjectAtPortraits(user.id);
    projectIds.push(project.id);

    await prisma.project.update({
      where: { id: project.id },
      data: { stepState: "RUNNING", stepStartedAt: new Date() },
    });

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(409);
    expect(generatePortraitMock).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's project", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userIds.push(owner.id, intruder.id);
    const project = await createProjectAtPortraits(owner.id);
    projectIds.push(project.id);

    await createSession(intruder.id);
    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(404);
    expect(generatePortraitMock).not.toHaveBeenCalled();
  });

  it("persists a retryable FAILED state when Gemini errors, then succeeds on retry", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProjectAtPortraits(user.id);
    projectIds.push(project.id);
    generatePortraitMock.mockRejectedValue(new Error("boom"));

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(200);
    const { project: body } = await response.json();
    expect(body.stepState).toBe("FAILED");
    expect(body.currentStep).toBe("PORTRAITS");

    generatePortraitMock.mockResolvedValue({
      image: { data: Buffer.from("bytes").toString("base64"), mimeType: "image/png" },
      interactionId: "int-retry",
    });
    const retry = postRequest(project.id);
    const retryResponse = await POST(retry.request, retry.context);
    expect(retryResponse.status).toBe(200);
    const { project: retryBody } = await retryResponse.json();
    expect(retryBody.currentStep).toBe("CHAPTERS");
  });
});
