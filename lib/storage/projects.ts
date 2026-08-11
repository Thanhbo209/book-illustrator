import "server-only";

import { prisma } from "@/lib/storage/db";
import { readBookText, writeBookText } from "@/lib/storage/files";
import { deriveProjectStatus, isStale, STALE_MS } from "@/lib/pipeline/state";
import type { CharacterModel, ChapterModel, ProjectModel } from "@/lib/generated/prisma/models";
import type { CharacterDTO, ChapterDTO, ProjectDetail, ProjectSummary } from "@/types/domain";
import type { PipelineStep } from "@/types/pipeline";
import type { CharacterOutput } from "@/lib/validation/gemini";

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

/**
 * Atomically claims a step for execution: succeeds only if the project is
 * currently on `step` and that step is IDLE, FAILED, or a stale RUNNING
 * (server died mid-call). A second concurrent request — double-click,
 * refresh, second tab — matches nothing and gets count 0, so it never
 * triggers a duplicate Gemini call.
 */
export async function claimStep(
  projectId: string,
  userId: string,
  step: PipelineStep,
  now: Date = new Date(),
): Promise<boolean> {
  const staleCutoff = new Date(now.getTime() - STALE_MS);
  const result = await prisma.project.updateMany({
    where: {
      id: projectId,
      userId,
      currentStep: step,
      OR: [
        { stepState: { in: ["IDLE", "FAILED"] } },
        { stepState: "RUNNING", stepStartedAt: { lt: staleCutoff } },
      ],
    },
    data: { stepState: "RUNNING", stepStartedAt: now, stepError: null },
  });
  return result.count === 1;
}

export interface CompleteStyleStepInput {
  projectId: string;
  style: string;
  bookFileUri: string;
  bookFileExpiresAt: Date;
  interactionId: string;
}

export async function completeStyleStep(input: CompleteStyleStepInput): Promise<void> {
  await prisma.project.update({
    where: { id: input.projectId },
    data: {
      style: input.style,
      bookFileUri: input.bookFileUri,
      bookFileExpiresAt: input.bookFileExpiresAt,
      lastInteractionId: input.interactionId,
      currentStep: "CHARACTERS",
      stepState: "IDLE",
      stepStartedAt: null,
      stepError: null,
    },
  });
}

export interface CompleteCharactersStepInput {
  projectId: string;
  characters: CharacterOutput[];
  interactionId: string;
}

export async function completeCharactersStep(input: CompleteCharactersStepInput): Promise<void> {
  await prisma.$transaction([
    // Defensive: clears out any stale rows from an earlier partial attempt
    // before writing the current, validated set.
    prisma.character.deleteMany({ where: { projectId: input.projectId } }),
    prisma.character.createMany({
      data: input.characters.map((character, index) => ({
        projectId: input.projectId,
        order: index + 1,
        name: character.name,
        prompt: character.prompt,
      })),
    }),
    prisma.project.update({
      where: { id: input.projectId },
      data: {
        lastInteractionId: input.interactionId,
        currentStep: "PORTRAITS",
        stepState: "IDLE",
        stepStartedAt: null,
        stepError: null,
      },
    }),
  ]);
}

export async function failStep(projectId: string, message: string): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { stepState: "FAILED", stepError: message, stepStartedAt: null },
  });
}
