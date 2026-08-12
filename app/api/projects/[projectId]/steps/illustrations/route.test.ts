// @vitest-environment node
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCookieStore } from "@/tests/mocks/next-headers";

vi.mock("next/headers", () => import("@/tests/mocks/next-headers"));
vi.mock("@/lib/gemini/service", () => ({
  generateIllustration: vi.fn(),
}));

import { POST } from "@/app/api/projects/[projectId]/steps/illustrations/route";
import { generateIllustration } from "@/lib/gemini/service";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/storage/db";
import {
  advancePortraitsStep,
  claimStep,
  completeChaptersStep,
  completeCharacterPortrait,
  completeCharactersStep,
  completeStyleStep,
  createProject,
  getProjectForUser,
} from "@/lib/storage/projects";
import { characterPortraitPath, writeImage } from "@/lib/storage/files";

const generateIllustrationMock = vi.mocked(generateIllustration);

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `illustrations-route-${crypto.randomUUID()}@test.dev` },
  });
}

async function createProjectAtIllustrations(userId: string) {
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
  const detail = await getProjectForUser(project.id, userId);
  const character = detail!.characters[0];
  const portraitPath = characterPortraitPath(project.id, character.order, "image/png");
  await writeImage(portraitPath, Buffer.from("portrait-bytes"));
  await completeCharacterPortrait(character.id, portraitPath);
  await advancePortraitsStep(project.id);

  await claimStep(project.id, userId, "CHAPTERS");
  await completeChaptersStep({
    projectId: project.id,
    chapter: { title: "River Bank", prompt: "a scene by the river" },
    interactionId: "int-chapters",
  });
  return project;
}

function postRequest(projectId: string) {
  return {
    request: new Request(`http://localhost/api/projects/${projectId}/steps/illustrations`, {
      method: "POST",
    }),
    context: { params: Promise.resolve({ projectId }) },
  };
}

describe("POST /api/projects/:id/steps/illustrations", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    resetCookieStore();
    generateIllustrationMock.mockReset();
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
    expect(generateIllustrationMock).not.toHaveBeenCalled();
  });

  it("runs the step and returns the completed, DONE project with the persisted illustration", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProjectAtIllustrations(user.id);
    projectIds.push(project.id);
    generateIllustrationMock.mockResolvedValue({
      image: { data: Buffer.from("bytes").toString("base64"), mimeType: "image/png" },
      interactionId: "int-illustration",
    });

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(200);
    const { project: body } = await response.json();
    expect(body.currentStep).toBe("DONE");
    expect(body.status).toBe("DONE");
    expect(body.chapters[0].illustrationState).toBe("COMPLETED");
    expect(body.chapters[0].illustrationUrl).not.toBeNull();
    expect(generateIllustrationMock).toHaveBeenCalledTimes(1);
  });

  it("cannot be triggered before Chapters has completed", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(409);
    expect(generateIllustrationMock).not.toHaveBeenCalled();
  });

  it("returns 409 and skips Gemini entirely on a duplicate concurrent request", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProjectAtIllustrations(user.id);
    projectIds.push(project.id);

    await prisma.project.update({
      where: { id: project.id },
      data: { stepState: "RUNNING", stepStartedAt: new Date() },
    });

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(409);
    expect(generateIllustrationMock).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's project", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userIds.push(owner.id, intruder.id);
    const project = await createProjectAtIllustrations(owner.id);
    projectIds.push(project.id);

    await createSession(intruder.id);
    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(404);
    expect(generateIllustrationMock).not.toHaveBeenCalled();
  });

  it("persists a retryable FAILED state when Gemini errors, then succeeds on retry", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await createSession(user.id);
    const project = await createProjectAtIllustrations(user.id);
    projectIds.push(project.id);
    generateIllustrationMock.mockRejectedValue(new Error("boom"));

    const { request, context } = postRequest(project.id);
    const response = await POST(request, context);

    expect(response.status).toBe(200);
    const { project: body } = await response.json();
    expect(body.stepState).toBe("FAILED");
    expect(body.currentStep).toBe("ILLUSTRATIONS");

    generateIllustrationMock.mockResolvedValue({
      image: { data: Buffer.from("bytes").toString("base64"), mimeType: "image/png" },
      interactionId: "int-retry",
    });
    const retry = postRequest(project.id);
    const retryResponse = await POST(retry.request, retry.context);
    expect(retryResponse.status).toBe(200);
    const { project: retryBody } = await retryResponse.json();
    expect(retryBody.currentStep).toBe("DONE");
  });
});
