import "server-only";

import { prisma } from "@/lib/storage/db";
import { readBookText, writeBookText } from "@/lib/storage/files";
import { deriveProjectStatus, isStale } from "@/lib/pipeline/state";
import type { CharacterModel, ChapterModel, ProjectModel } from "@/lib/generated/prisma/models";
import type { CharacterDTO, ChapterDTO, ProjectDetail, ProjectSummary } from "@/types/domain";

function toCharacterDTO(character: CharacterModel): CharacterDTO {
  return {
    id: character.id,
    order: character.order,
    name: character.name,
    prompt: character.prompt,
    portraitUrl:
      character.portraitState === "COMPLETED"
        ? `/api/projects/${character.projectId}/image/character/${character.order}`
        : null,
    portraitState: character.portraitState,
    portraitError: character.portraitError,
  };
}

function toChapterDTO(chapter: ChapterModel): ChapterDTO {
  return {
    id: chapter.id,
    order: chapter.order,
    title: chapter.title,
    prompt: chapter.prompt,
    illustrationUrl:
      chapter.illustrationState === "COMPLETED"
        ? `/api/projects/${chapter.projectId}/image/chapter/${chapter.order}`
        : null,
    illustrationState: chapter.illustrationState,
    illustrationError: chapter.illustrationError,
  };
}

export function toProjectSummary(project: ProjectModel): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    createdAt: project.createdAt.toISOString(),
    status: deriveProjectStatus(project),
    currentStep: project.currentStep,
    stepState: project.stepState,
  };
}

async function toProjectDetail(
  project: ProjectModel & { characters: CharacterModel[]; chapters: ChapterModel[] },
): Promise<ProjectDetail> {
  const bookText = await readBookText(project.id);
  return {
    ...toProjectSummary(project),
    bookText,
    style: project.style,
    stepError: project.stepError,
    stepStartedAt: project.stepStartedAt?.toISOString() ?? null,
    isStale: isStale(project),
    characters: project.characters.sort((a, b) => a.order - b.order).map(toCharacterDTO),
    chapters: project.chapters.sort((a, b) => a.order - b.order).map(toChapterDTO),
  };
}

export async function listProjectsForUser(userId: string): Promise<ProjectSummary[]> {
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return projects.map(toProjectSummary);
}

/** Returns null if the project doesn't exist or isn't owned by this user. */
export async function getProjectForUser(
  projectId: string,
  userId: string,
): Promise<ProjectDetail | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { characters: true, chapters: true },
  });
  if (!project) return null;
  return toProjectDetail(project);
}

export interface CreateProjectInput {
  userId: string;
  title: string;
  bookText: string;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
  const project = await prisma.project.create({
    data: {
      userId: input.userId,
      title: input.title,
      // Placeholder until the file is written just below — projectId isn't
      // known before the row is created, so this can't be computed upfront.
      bookTextPath: "",
    },
  });

  await writeBookText(project.id, input.bookText);

  const bookTextPath = `projects/${project.id}/book.txt`;
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { bookTextPath },
  });

  return toProjectSummary(updated);
}
