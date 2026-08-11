import "server-only";

import { prisma } from "@/lib/storage/db";
import { completeCharactersStep, failStep } from "@/lib/storage/projects";
import { generateCharacters } from "@/lib/gemini/service";
import { GeminiApiError, GeminiResponseShapeError } from "@/lib/gemini/errors";

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof GeminiApiError || error instanceof GeminiResponseShapeError) {
    return error.message;
  }
  return "Character generation failed. Please try again.";
}

/**
 * Runs the Characters step to a terminal state (COMPLETED → advances to
 * PORTRAITS, or FAILED) and persists the outcome. Assumes the caller has
 * already claimed the step via claimStep() — never call this without a
 * successful claim, or two requests could run Gemini concurrently.
 */
export async function runCharactersStep(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

    // Guaranteed non-null: the project can't reach CHARACTERS without Style
    // having completed and persisted it first.
    if (!project.lastInteractionId) {
      throw new Error("Missing interaction context from the Style step");
    }

    const result = await generateCharacters({
      previousInteractionId: project.lastInteractionId,
    });

    await completeCharactersStep({
      projectId,
      characters: result.characters,
      interactionId: result.interactionId,
    });
  } catch (error) {
    await failStep(projectId, toSafeErrorMessage(error));
  }
}
