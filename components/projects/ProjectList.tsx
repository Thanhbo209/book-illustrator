import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/projects/ProjectCard";
import type { ProjectSummary } from "@/types/domain";

export function ProjectList({ projects }: { projects: ProjectSummary[] }) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="space-y-1">
          <p className="text-lg font-medium">No projects yet</p>
          <p className="text-sm text-muted-foreground">
            Paste or upload a book&apos;s text to start your first illustration pipeline.
          </p>
        </div>
        <Button render={<Link href="/projects/new" />} nativeButton={false}>
          New project
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
