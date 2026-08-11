import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProjectList } from "@/components/projects/ProjectList";
import { getCurrentUser } from "@/lib/auth/session";
import { listProjectsForUser } from "@/lib/storage/projects";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const projects = user ? await listProjectsForUser(user.id) : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your projects</h1>
        {projects.length > 0 ? (
          <Button render={<Link href="/projects/new" />}>New project</Button>
        ) : null}
      </div>
      <ProjectList projects={projects} />
    </div>
  );
}
