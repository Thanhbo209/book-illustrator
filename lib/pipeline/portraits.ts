import "server-only";

import { prisma } from "@/lib/storage/db";
import { characterPortraitPath, writeImage } from "@/lib/storage/files";
import {
  advancePortraitsStep,
  completeCharacterPortrait,
  failCharacterPortrait,
  failStep,
  startCharacterPortrait,
} from "@/lib/storage/projects";
import { generatePortrait } from "@/lib/gemini/service";
import { GeminiApiError, GeminiResponseShapeError } from "@/lib/gemini/errors";

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof GeminiApiError || error instanceof GeminiResponseShapeError) {
    return error.message;
  }
  return "Portrait generation failed. Please try again.";
}

/**
 * Runs the Portraits step. Unlike Style/Characters, this generates one
 * image per character and continues past a single character's failure —
 * a character already COMPLETED is never regenerated, so retrying only
 * redoes the failed one(s). The overall step is marked FAILED only if at
 * least one character ended up FAILED.
 */
export async function runPortraitsStep(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { characters: true },
    });

    const style = project.style ?? "";
    let anyFailed = false;

    const characters = [...project.characters].sort((a, b) => a.order - b.order);
    for (const character of characters) {
      if (character.portraitState === "COMPLETED") continue;

      await startCharacterPortrait(character.id);
      try {
        const result = await generatePortrait({
          character: { name: character.name, prompt: character.prompt },
          style,
        });
        const filePath = characterPortraitPath(projectId, character.order, result.image.mimeType);
        await writeImage(filePath, Buffer.from(result.image.data, "base64"));
        await completeCharacterPortrait(character.id, filePath);
      } catch (innerError) {
        anyFailed = true;
        await failCharacterPortrait(character.id, toSafeErrorMessage(innerError));
      }
    }

    if (anyFailed) {
      await failStep(projectId, "One or more character portraits failed to generate. Retry to continue.");
    } else {
      await advancePortraitsStep(projectId);
    }
  } catch (error) {
    await failStep(projectId, toSafeErrorMessage(error));
  }
}
