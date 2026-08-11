import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { claimStep, getProjectForUser } from "@/lib/storage/projects";
import { runStyleStep } from "@/lib/pipeline/style";
import { styleStepSchema } from "@/lib/validation/pipeline";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Not authenticated");

  const { projectId } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = styleStepSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }

  // A failed claim means the step is already running (fresh) or isn't the
  // current step — either way, no Gemini call happens; we just report the
  // project's actual state back.
  const claimed = await claimStep(projectId, user.id, "STYLE");
  if (claimed) {
    await runStyleStep(projectId, parsed.data.style);
  }

  const project = await getProjectForUser(projectId, user.id);
  if (!project) return apiError(404, "Project not found");

  return NextResponse.json({ project }, { status: claimed ? 200 : 409 });
}
