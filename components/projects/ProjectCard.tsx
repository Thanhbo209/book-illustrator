import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stepper } from "@/components/pipeline/Stepper";
import type { ProjectSummary } from "@/types/domain";
import type { ProjectStatus } from "@/types/pipeline";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const STATUS_VARIANT: Record<ProjectStatus, "outline" | "default" | "secondary"> = {
  DRAFT: "outline",
  IN_PROGRESS: "default",
  DONE: "secondary",
};

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const createdAt = new Date(project.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Link href={`/projects/${project.id}`} className="block h-full">
      <Card className="h-full justify-between transition-colors hover:bg-muted/50">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-1 text-lg font-semibold">{project.title}</CardTitle>
            <Badge variant={STATUS_VARIANT[project.status]}>{STATUS_LABEL[project.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Created {createdAt}</p>
        </CardHeader>
        <CardContent>
          <Stepper currentStep={project.currentStep} stepState={project.stepState} />
        </CardContent>
      </Card>
    </Link>
  );
}
