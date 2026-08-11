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

export function characterPortraitPath(projectId: string, order: number): string {
  return path.join(projectDir(projectId), "characters", `${order}.png`);
}

export function chapterIllustrationPath(projectId: string, order: number): string {
  return path.join(projectDir(projectId), "chapters", `${order}.png`);
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
