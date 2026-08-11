// @vitest-environment node
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini/service", () => ({
  uploadBookText: vi.fn(),
  generateStyle: vi.fn(),
}));

import { generateStyle, uploadBookText } from "@/lib/gemini/service";
import { GeminiApiError } from "@/lib/gemini/errors";
import { prisma } from "@/lib/storage/db";
import { claimStep, createProject, getProjectForUser } from "@/lib/storage/projects";
import { runStyleStep } from "@/lib/pipeline/style";

const uploadBookTextMock = vi.mocked(uploadBookText);
const generateStyleMock = vi.mocked(generateStyle);

async function createTestUser() {
  return prisma.user.create({
    data: { name: "Test User", email: `style-step-${crypto.randomUUID()}@test.dev` },
  });
}

describe("runStyleStep", () => {
  const projectIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    uploadBookTextMock.mockReset();
    generateStyleMock.mockReset();
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

  it("uploads the book once, generates the style, and advances to CHARACTERS", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "Once upon a time." });
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "STYLE");

    uploadBookTextMock.mockResolvedValue({
      uri: "files/abc",
      mimeType: "text/plain",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    generateStyleMock.mockResolvedValue({ style: "Warm watercolor", interactionId: "int-1" });

    await runStyleStep(project.id);

    expect(uploadBookTextMock).toHaveBeenCalledWith("Once upon a time.");
    expect(generateStyleMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookFileUri: "files/abc", userStyle: undefined }),
    );

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.style).toBe("Warm watercolor");
    expect(detail?.currentStep).toBe("CHARACTERS");
    expect(detail?.stepState).toBe("IDLE");
  });

  it("passes the user-provided style through to the Gemini call", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "STYLE");

    uploadBookTextMock.mockResolvedValue({
      uri: "files/abc",
      mimeType: "text/plain",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    generateStyleMock.mockResolvedValue({ style: "Bold ink-wash, as requested.", interactionId: "int-1" });

    await runStyleStep(project.id, "Bold ink-wash");

    expect(generateStyleMock).toHaveBeenCalledWith(
      expect.objectContaining({ userStyle: "Bold ink-wash" }),
    );
  });

  it("does not re-upload the book if the existing file hasn't expired", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "STYLE");
    await prisma.project.update({
      where: { id: project.id },
      data: { bookFileUri: "files/existing", bookFileExpiresAt: new Date(Date.now() + 1000 * 60 * 60) },
    });

    generateStyleMock.mockResolvedValue({ style: "Style", interactionId: "int-1" });

    await runStyleStep(project.id);

    expect(uploadBookTextMock).not.toHaveBeenCalled();
    expect(generateStyleMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookFileUri: "files/existing" }),
    );
  });

  it("re-uploads the book if the existing file has expired", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "STYLE");
    await prisma.project.update({
      where: { id: project.id },
      data: { bookFileUri: "files/expired", bookFileExpiresAt: new Date(Date.now() - 1000) },
    });

    uploadBookTextMock.mockResolvedValue({
      uri: "files/fresh",
      mimeType: "text/plain",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    generateStyleMock.mockResolvedValue({ style: "Style", interactionId: "int-1" });

    await runStyleStep(project.id);

    expect(uploadBookTextMock).toHaveBeenCalled();
    expect(generateStyleMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookFileUri: "files/fresh" }),
    );
  });

  it("persists a FAILED state with a safe message when Gemini errors, without advancing", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "STYLE");

    uploadBookTextMock.mockResolvedValue({
      uri: "files/abc",
      mimeType: "text/plain",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    generateStyleMock.mockRejectedValue(new GeminiApiError("quota exceeded", "too_many_requests"));

    await runStyleStep(project.id);

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.currentStep).toBe("STYLE");
    expect(detail?.stepState).toBe("FAILED");
    expect(detail?.stepError).toBe("quota exceeded");
  });

  it("never throws — always resolves to a terminal state even on unexpected errors", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const project = await createProject({ userId: user.id, title: "T", bookText: "text" });
    projectIds.push(project.id);
    await claimStep(project.id, user.id, "STYLE");

    uploadBookTextMock.mockRejectedValue(new Error("ENOENT: /some/internal/path"));

    await expect(runStyleStep(project.id)).resolves.toBeUndefined();

    const detail = await getProjectForUser(project.id, user.id);
    expect(detail?.stepState).toBe("FAILED");
    expect(detail?.stepError).not.toContain("/some/internal/path");
  });
});
