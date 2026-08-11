// @vitest-environment node
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCookieStore } from "@/tests/mocks/next-headers";

vi.mock("next/headers", () => import("@/tests/mocks/next-headers"));
vi.mock("@/lib/gemini/service", () => ({
  generateCharacters: vi.fn(),
}));

import { POST } from "@/app/api/projects/[projectId]/steps/characters/route";
import { generateCharacters } from "@/lib/gemini/service";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/storage/db";
import { claimStep, completeStyleStep, createProject } from "@/lib/storage/projects";

const generateCharactersMock = vi.mocked(generateCharacters);

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `characters-route-${crypto.randomUUID()}@test.dev` },
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

function postRequest(projectId: string) {
  return {
    request: new Request(`http://localhost/api/projects/${projectId}/steps/characters`, {
      method: "POST",
    }),
    context: { params: Promise.resolve({ projectId }) },
  };
}

describe("POST /api/projects/:id/steps/characters", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    resetCookieStore();
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

  it("rejects an unauthenticated request", async () => {
    const { request, context } = postRequest("some-id");
    const response = await POST(request, context);
    expect(response.status).toBe(401);
    expect(generateCharactersMock).not.toHaveBeenCalled();
  });

  it("runs the step and returns the completed project with persisted characters", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProjectAtCharacters(user.id);
    projectIds.push(project.id);
    generateCharactersMock.mockResolvedValue({
      characters: [{ name: "Mole", prompt: "a small mole" }],
      interactionId: "int-characters",
    });

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(200);
    const { project: body } = await response.json();
    expect(body.currentStep).toBe("PORTRAITS");
    expect(body.characters).toEqual([
      expect.objectContaining({ name: "Mole", prompt: "a small mole" }),
    ]);
    expect(generateCharactersMock).toHaveBeenCalledTimes(1);
  });

  it("cannot be triggered before Style has completed", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(409);
    expect(generateCharactersMock).not.toHaveBeenCalled();
  });

  it("returns 409 and skips Gemini entirely on a duplicate concurrent request", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProjectAtCharacters(user.id);
    projectIds.push(project.id);

    await prisma.project.update({
      where: { id: project.id },
      data: { stepState: "RUNNING", stepStartedAt: new Date() },
    });

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(409);
    expect(generateCharactersMock).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's project", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userIds.push(owner.id, intruder.id);
    const project = await createProjectAtCharacters(owner.id);
    projectIds.push(project.id);

    await createSession(intruder.id);
    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(404);
    expect(generateCharactersMock).not.toHaveBeenCalled();
  });

  it("persists a retryable FAILED state when Gemini errors, then succeeds on retry", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProjectAtCharacters(user.id);
    projectIds.push(project.id);
    generateCharactersMock.mockRejectedValue(new Error("boom"));

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(200);
    const { project: body } = await response.json();
    expect(body.stepState).toBe("FAILED");
    expect(body.currentStep).toBe("CHARACTERS");

    generateCharactersMock.mockResolvedValue({
      characters: [{ name: "Recovered", prompt: "a recovered character" }],
      interactionId: "int-retry",
    });
    const retry = postRequest(project.id);
    const retryResponse = await POST(retry.request, retry.context);
    expect(retryResponse.status).toBe(200);
    const { project: retryBody } = await retryResponse.json();
    expect(retryBody.characters[0].name).toBe("Recovered");
  });
});
