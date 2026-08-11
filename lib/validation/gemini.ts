import { z } from "zod";

export const characterSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
});

// Max 2 adult characters — a hard requirement (assessment §03). Gemini
// returning more or fewer fails validation rather than being silently
// truncated, so a malformed generation surfaces as a retryable failure
// instead of quietly persisting something the model didn't actually say.
export const charactersResponseSchema = z.array(characterSchema).min(1).max(2);

export const chapterSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
});

// Max 1 chapter — same reasoning as characters above.
export const chaptersResponseSchema = z.array(chapterSchema).length(1);

export type CharacterOutput = z.infer<typeof characterSchema>;
export type ChapterOutput = z.infer<typeof chapterSchema>;

/** Converts a Zod schema to the raw JSON Schema shape Gemini's `response_format` expects. */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
