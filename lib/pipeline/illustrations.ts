import "server-only";

import { prisma } from "@/lib/storage/db";
import { chapterIllustrationPath, mimeTypeForPath, readImage, writeImage } from "@/lib/storage/files";
import { completeIllustrationStep, failStep } from "@/lib/storage/projects";
import { generateIllustration } from "@/lib/gemini/service";
import { GeminiApiError, GeminiResponseShapeError } from "@/lib/gemini/errors";

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof GeminiApiError || error instanceof GeminiResponseShapeError) {
    return error.message;
  }
  return "Illustration generation failed. Please try again.";
}

/**
 * Runs the Illustrations step to a terminal state (COMPLETED → advances
 * to DONE, or FAILED) and persists the outcome. Independent call, not
 * chained (same reasoning as Portraits) — character consistency comes
 * from passing the persisted portraits as explicit reference images.
 * Assumes the caller has already claimed the step via claimStep().
 */
export async function runIllustrationsStep(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { characters: true, chapters: true },
    });

    const chapter = project.chapters.find((c) => c.order === 1);
    if (!chapter) {
      throw new Error("Missing chapter for illustration generation");
    }

    const style = project.style ?? "";

    const characterPortraits = [];
    for (const character of project.characters) {
      if (character.portraitState === "COMPLETED" && character.portraitPath) {
        const data = await readImage(character.portraitPath);
        characterPortraits.push({
          name: character.name,
          data: data.toString("base64"),
          mimeType: mimeTypeForPath(character.portraitPath),
        });
      }
    }

    const result = await generateIllustration({
      chapter: { title: chapter.title, prompt: chapter.prompt },
      style,
      characterPortraits,
    });

    const filePath = chapterIllustrationPath(projectId, chapter.order, result.image.mimeType);
    await writeImage(filePath, Buffer.from(result.image.data, "base64"));
    await completeIllustrationStep(chapter.id, projectId, filePath);
  } catch (error) {
    await failStep(projectId, toSafeErrorMessage(error));
  }
}
