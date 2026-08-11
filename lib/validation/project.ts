import { z } from "zod";

export const MAX_BOOK_TEXT_BYTES = 5 * 1024 * 1024; // 5MB — generous for a novel's plain text
export const ALLOWED_BOOK_FILE_EXTENSION = ".txt";

export const projectTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Title is too long");

export const bookTextSchema = z
  .string()
  .trim()
  .min(1, "Book text is required")
  .max(MAX_BOOK_TEXT_BYTES, "Book text is too large");

export interface ParsedCreateProject {
  title: string;
  bookText: string;
}

export type ParseCreateProjectResult =
  | { ok: true; data: ParsedCreateProject }
  | { ok: false; message: string };

/**
 * `instanceof File` is unreliable across realms (jsdom's File vs the
 * platform's, Node's undici File vs an edge runtime's) — duck-type instead.
 */
function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { size?: unknown }).size === "number" &&
    typeof (value as { text?: unknown }).text === "function"
  );
}

/**
 * Extracts and validates a new-project submission from multipart form data.
 * The user may paste text or upload a .txt file.
 * If both are provided, the uploaded file takes priority.
 * The uploaded filename is only ever inspected for validation,
 * never used as a path.
 */
export async function parseCreateProjectForm(
  formData: FormData,
): Promise<ParseCreateProjectResult> {
  const titleResult = projectTitleSchema.safeParse(formData.get("title"));
  if (!titleResult.success) {
    return {
      ok: false,
      message: titleResult.error.issues[0]?.message ?? "Invalid title",
    };
  }

  const file = formData.get("file");
  const pastedText = formData.get("bookText");

  let rawText: string | null = null;

  if (isUploadedFile(file) && file.size > 0) {
    if (!file.name.toLowerCase().endsWith(ALLOWED_BOOK_FILE_EXTENSION)) {
      return { ok: false, message: "Only .txt files are accepted" };
    }
    if (file.size > MAX_BOOK_TEXT_BYTES) {
      return { ok: false, message: "File is too large (max 5MB)" };
    }
    rawText = await file.text();
  } else if (typeof pastedText === "string" && pastedText.trim().length > 0) {
    rawText = pastedText;
  }

  if (rawText === null) {
    return {
      ok: false,
      message: "Provide book text by pasting it or uploading a .txt file",
    };
  }

  const bookTextResult = bookTextSchema.safeParse(rawText);
  if (!bookTextResult.success) {
    return {
      ok: false,
      message: bookTextResult.error.issues[0]?.message ?? "Invalid book text",
    };
  }

  return {
    ok: true,
    data: { title: titleResult.data, bookText: bookTextResult.data },
  };
}
