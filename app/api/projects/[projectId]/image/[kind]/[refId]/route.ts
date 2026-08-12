import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/storage/db";
import { mimeTypeForPath, readImage } from "@/lib/storage/files";

const VALID_KINDS = ["character", "chapter"] as const;
type ImageKind = (typeof VALID_KINDS)[number];

function isValidKind(value: string): value is ImageKind {
  return (VALID_KINDS as readonly string[]).includes(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; kind: string; refId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Not authenticated");

  const { projectId, kind, refId } = await params;

  // Ownership failure and "doesn't exist" are intentionally indistinguishable
  // (404 for both) — matches every other route in this app; see the
  // projects/[id] route for the same reasoning.
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return apiError(404, "Image not found");

  const order = Number(refId);
  if (!isValidKind(kind) || !Number.isInteger(order) || order < 1) {
    return apiError(400, "Invalid image reference");
  }

  // The DB row is the only source for the file path — never built from the
  // request. `refId`/`kind` only select *which* row to look up.
  const filePath =
    kind === "character"
      ? (await prisma.character.findFirst({ where: { projectId, order } }))?.portraitPath
      : (await prisma.chapter.findFirst({ where: { projectId, order } }))?.illustrationPath;

  if (!filePath) return apiError(404, "Image not found");

  try {
    const buffer = await readImage(filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeTypeForPath(filePath),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return apiError(404, "Image not found");
  }
}
