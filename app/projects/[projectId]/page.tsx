import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stepper } from "@/components/pipeline/Stepper";
import { StyleStepPanel } from "@/components/pipeline/StyleStepPanel";
import { CharactersStepPanel } from "@/components/pipeline/CharactersStepPanel";
import { CharacterCard } from "@/components/pipeline/CharacterCard";
import { getCurrentUser } from "@/lib/auth/session";
import { getProjectForUser } from "@/lib/storage/projects";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const { projectId } = await params;
  const project = await getProjectForUser(projectId, user.id);
  if (!project) notFound();

  const createdAt = new Date(project.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{project.title}</h1>
        <p className="text-sm text-muted-foreground">Created {createdAt}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Stepper currentStep={project.currentStep} stepState={project.stepState} />
          <StyleStepPanel project={project} />
          <CharactersStepPanel project={project} />
        </CardContent>
      </Card>

      {project.style ? (
        <Card>
          <CardHeader>
            <CardTitle>Art style</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{project.style}</p>
          </CardContent>
        </Card>
      ) : null}

      {project.characters.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {project.characters.map((character) => (
            <CharacterCard key={character.id} character={character} />
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Book text</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-foreground">
            {project.bookText}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
