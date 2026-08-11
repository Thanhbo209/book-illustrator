import "server-only";

import { prisma } from "@/lib/storage/db";
import { readBookText } from "@/lib/storage/files";
import { completeStyleStep, failStep } from "@/lib/storage/projects";
import { generateStyle, uploadBookText } from "@/lib/gemini/service";
import { GeminiApiError, GeminiResponseShapeError } from "@/lib/gemini/errors";

const BOOK_MIME_TYPE = "text/plain";

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof GeminiApiError || error instanceof GeminiResponseShapeError) {
    return error.message;
  }
  return "Style generation failed. Please try again.";
}

/**
 * Runs the Style step to a terminal state (COMPLETED → advances to
 * CHARACTERS, or FAILED) and persists the outcome. Assumes the caller has
 * already claimed the step via claimStep() — never call this without a
 * successful claim, or two requests could run Gemini concurrently.
 */
export async function runStyleStep(projectId: string, userStyle?: string): Promise<void> {
  try {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

    let bookFileUri = project.bookFileUri;
    let bookFileExpiresAt = project.bookFileExpiresAt;

    const needsUpload =
      !bookFileUri || !bookFileExpiresAt || bookFileExpiresAt.getTime() <= Date.now();

    if (needsUpload) {
      const bookText = await readBookText(projectId);
      const uploaded = await uploadBookText(bookText);
      bookFileUri = uploaded.uri;
      bookFileExpiresAt = uploaded.expiresAt;
    }

    const result = await generateStyle({
      bookFileUri,
      bookFileMimeType: BOOK_MIME_TYPE,
      userStyle,
    });

    await completeStyleStep({
      projectId,
      style: result.style,
      bookFileUri,
      bookFileExpiresAt,
      interactionId: result.interactionId,
    });
  } catch (error) {
    await failStep(projectId, toSafeErrorMessage(error));
  }
}
