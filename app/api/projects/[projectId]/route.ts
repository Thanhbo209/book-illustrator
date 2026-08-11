import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { getProjectForUser } from "@/lib/storage/projects";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Not authenticated");

  const { projectId } = await params;
  const project = await getProjectForUser(projectId, user.id);
  // A project that exists but belongs to someone else looks identical to a
  // missing one — no signal to a caller that the id is otherwise valid.
  if (!project) return apiError(404, "Project not found");

  return NextResponse.json({ project });
}
