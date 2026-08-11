import "server-only";

import {
  createInteraction,
  getModelOutputText,
  uploadFile,
  type InteractionInputItem,
} from "@/lib/gemini/client";
import { getGeminiConfig } from "@/lib/gemini/config";
import { GeminiResponseShapeError } from "@/lib/gemini/errors";
import { IMAGE_SYSTEM_INSTRUCTIONS } from "@/lib/gemini/imageInstructions";
import { parseGeneratedImage, type GeneratedImage } from "@/lib/gemini/imageResponse";
import {
  chaptersResponseSchema,
  charactersResponseSchema,
  toGeminiSchema,
  type ChapterOutput,
  type CharacterOutput,
} from "@/lib/validation/gemini";

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiResponseShapeError(`Gemini did not return valid JSON: ${text.slice(0, 200)}`);
  }
}

export interface UploadedBookFile {
  uri: string;
  mimeType: string;
  expiresAt: Date;
}

export async function uploadBookText(bookText: string): Promise<UploadedBookFile> {
  return uploadFile({
    content: Buffer.from(bookText, "utf-8"),
    mimeType: "text/plain",
    displayName: "book.txt",
  });
}

export interface StyleResult {
  style: string;
  interactionId: string;
}

// Step 1 doubles as the book's first (and only) upload: the document is
// attached here and every later step chains from this interaction's id,
// so the full book text is never sent to Gemini more than once.
export async function generateStyle(params: {
  bookFileUri: string;
  bookFileMimeType: string;
  userStyle?: string;
}): Promise<StyleResult> {
  const { textModel } = getGeminiConfig();

  const instruction = params.userStyle
    ? `The illustrations for this book must use the following art style, as specified by the user: "${params.userStyle}". Restate it in one or two sentences as a clear style guide for an illustrator, preserving the user's intent — do not invent a different style.`
    : "Read this book and propose a single, cohesive illustration art style for it (medium, palette, mood) in two to three sentences. This will guide later character portraits and a scene illustration.";

  const input: InteractionInputItem[] = [
    { type: "text", text: instruction },
    { type: "document", uri: params.bookFileUri, mime_type: params.bookFileMimeType },
  ];

  const response = await createInteraction({ model: textModel, input });
  const style = getModelOutputText(response).trim();

  return { style, interactionId: response.id };
}

export interface CharactersResult {
  characters: CharacterOutput[];
  interactionId: string;
}

export async function generateCharacters(params: {
  previousInteractionId: string;
}): Promise<CharactersResult> {
  const { textModel } = getGeminiConfig();

  const response = await createInteraction({
    model: textModel,
    input:
      "List the main adult characters from this book (at most two), each with a name and a detailed image-generation prompt describing their appearance, suitable for an illustrator. Each prompt should be at least 50 words. Adults only — do not include children.",
    previousInteractionId: params.previousInteractionId,
    responseSchema: toGeminiSchema(charactersResponseSchema),
  });

  const parsed = parseJson(getModelOutputText(response));
  const result = charactersResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new GeminiResponseShapeError(`Malformed character list from Gemini: ${result.error.message}`);
  }

  return { characters: result.data, interactionId: response.id };
}

export interface PortraitResult {
  image: GeneratedImage;
  interactionId: string;
}

// Independent call, not chained (see DECISIONS.md "Image generation:
// independent calls, no persisted interaction chain"): style + the
// character's own prompt are already persisted and cheap to include
// directly, so there's nothing a chain would add here.
export async function generatePortrait(params: {
  character: { name: string; prompt: string };
  style: string;
}): Promise<PortraitResult> {
  const { imageModel } = getGeminiConfig();

  const response = await createInteraction({
    model: imageModel,
    input: `Create a character portrait illustration of ${params.character.name}. ${params.character.prompt} Art style: ${params.style}`,
    systemInstruction: IMAGE_SYSTEM_INSTRUCTIONS,
  });

  return { image: parseGeneratedImage(response), interactionId: response.id };
}

export interface ChaptersResult {
  chapters: ChapterOutput[];
  interactionId: string;
}

export async function generateChapters(params: {
  previousInteractionId: string;
  characters: { name: string }[];
}): Promise<ChaptersResult> {
  const { textModel } = getGeminiConfig();
  const characterNames = params.characters.map((character) => character.name).join(", ");

  const response = await createInteraction({
    model: textModel,
    input:
      "Propose one chapter illustration for this book: a title and a detailed scene-illustration prompt. " +
      `Reference these established characters by name in the prompt where appropriate: ${characterNames}.`,
    previousInteractionId: params.previousInteractionId,
    responseSchema: toGeminiSchema(chaptersResponseSchema),
  });

  const parsed = parseJson(getModelOutputText(response));
  const result = chaptersResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new GeminiResponseShapeError(`Malformed chapter list from Gemini: ${result.error.message}`);
  }

  return { chapters: result.data, interactionId: response.id };
}

export interface IllustrationResult {
  image: GeneratedImage;
  interactionId: string;
}

// Independent call, not chained — same reasoning as generatePortrait().
// Character consistency comes from the explicit reference images below,
// not from conversational memory of a prior interaction.
export async function generateIllustration(params: {
  chapter: { title: string; prompt: string };
  style: string;
  characterPortraits: { name: string; data: string; mimeType: string }[];
}): Promise<IllustrationResult> {
  const { imageModel } = getGeminiConfig();

  const referenceNote = params.characterPortraits.length
    ? ` Use the attached character reference portraits (${params.characterPortraits
        .map((portrait) => portrait.name)
        .join(", ")}) to keep each character's appearance consistent with their portrait.`
    : "";

  const input: InteractionInputItem[] = [
    {
      type: "text",
      text: `Create a scene illustration for the chapter "${params.chapter.title}". ${params.chapter.prompt} Art style: ${params.style}.${referenceNote}`,
    },
    ...params.characterPortraits.map(
      (portrait): InteractionInputItem => ({
        type: "image",
        data: portrait.data,
        mime_type: portrait.mimeType,
      }),
    ),
  ];

  const response = await createInteraction({
    model: imageModel,
    input,
    systemInstruction: IMAGE_SYSTEM_INSTRUCTIONS,
  });

  return { image: parseGeneratedImage(response), interactionId: response.id };
}
