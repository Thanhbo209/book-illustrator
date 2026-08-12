import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

function projectDir(projectId: string): string {
  return path.join(DATA_DIR, "projects", projectId);
}

export function bookTextPath(projectId: string): string {
  return path.join(projectDir(projectId), "book.txt");
}

// Gemini's actual image output type is unverified (quota-blocked) — never
// assume PNG. The extension is derived from whatever mime type the
// response actually reports, and the resulting path (stored on the
// Character/Chapter row) is what later determines how the image is served.
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function extensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME_TYPE[mimeType] ?? mimeType.split("/")[1]?.split("+")[0] ?? "bin";
}

/** Infers Content-Type from a persisted image path's extension. Never falls back to image/png for an unknown type. */
export function mimeTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return MIME_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function characterPortraitPath(projectId: string, order: number, mimeType: string): string {
  return path.join(projectDir(projectId), "characters", `${order}.${extensionForMimeType(mimeType)}`);
}

export function chapterIllustrationPath(projectId: string, order: number, mimeType: string): string {
  return path.join(projectDir(projectId), "chapters", `${order}.${extensionForMimeType(mimeType)}`);
}

export async function writeBookText(projectId: string, text: string): Promise<void> {
  const filePath = bookTextPath(projectId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf-8");
}

export async function readBookText(projectId: string): Promise<string> {
  return readFile(bookTextPath(projectId), "utf-8");
}

export async function writeImage(filePath: string, data: Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
}

export async function readImage(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}
