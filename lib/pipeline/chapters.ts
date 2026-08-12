import "server-only";

import { prisma } from "@/lib/storage/db";
import { completeChaptersStep, failStep } from "@/lib/storage/projects";
import { generateChapters } from "@/lib/gemini/service";
import { GeminiApiError, GeminiResponseShapeError } from "@/lib/gemini/errors";

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof GeminiApiError || error instanceof GeminiResponseShapeError) {
    return error.message;
  }
  return "Chapter generation failed. Please try again.";
}

/**
 * Runs the Chapters step to a terminal state (COMPLETED → advances to
 * ILLUSTRATIONS, or FAILED) and persists the outcome. Assumes the caller
 * has already claimed the step via claimStep() — never call this without
 * a successful claim, or two requests could run Gemini concurrently.
 */
export async function runChaptersStep(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { characters: true },
    });

    // Guaranteed non-null: the project can't reach CHAPTERS without
    // Characters having completed and persisted it first (Portraits
    // doesn't touch lastInteractionId — it's an independent image step).
    if (!project.lastInteractionId) {
      throw new Error("Missing interaction context from the Characters step");
    }

    const result = await generateChapters({
      previousInteractionId: project.lastInteractionId,
      characters: project.characters.map((character) => ({ name: character.name })),
    });

    await completeChaptersStep({
      projectId,
      chapter: result.chapters[0],
      interactionId: result.interactionId,
    });
  } catch (error) {
    await failStep(projectId, toSafeErrorMessage(error));
  }
}
