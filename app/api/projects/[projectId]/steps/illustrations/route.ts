import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { claimStep, getProjectForUser } from "@/lib/storage/projects";
import { runIllustrationsStep } from "@/lib/pipeline/illustrations";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Not authenticated");

  const { projectId } = await params;

  // A failed claim means the step is already running (fresh) or isn't the
  // current step — either way, no Gemini call happens; we just report the
  // project's actual state back.
  const claimed = await claimStep(projectId, user.id, "ILLUSTRATIONS");
  if (claimed) {
    await runIllustrationsStep(projectId);
  }

  const project = await getProjectForUser(projectId, user.id);
  if (!project) return apiError(404, "Project not found");

  return NextResponse.json({ project }, { status: claimed ? 200 : 409 });
}
