import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { createProject, listProjectsForUser } from "@/lib/storage/projects";
import { parseCreateProjectForm } from "@/lib/validation/project";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Not authenticated");

  const projects = await listProjectsForUser(user.id);
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Not authenticated");

  const formData = await request.formData().catch(() => null);
  if (!formData) return apiError(400, "Expected multipart form data");

  const parsed = await parseCreateProjectForm(formData);
  if (!parsed.ok) return apiError(400, parsed.message);

  const project = await createProject({
    userId: user.id,
    title: parsed.data.title,
    bookText: parsed.data.bookText,
  });

  return NextResponse.json({ project }, { status: 201 });
}
