import type { PipelineStep, ProjectStatus, StepState } from "@/types/pipeline";

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface CharacterDTO {
  id: string;
  order: number;
  name: string;
  prompt: string;
  portraitUrl: string | null;
  portraitState: StepState;
  portraitError: string | null;
}

export interface ChapterDTO {
  id: string;
  order: number;
  title: string;
  prompt: string;
  illustrationUrl: string | null;
  illustrationState: StepState;
  illustrationError: string | null;
}

export interface ProjectSummary {
  id: string;
  title: string;
  createdAt: string;
  status: ProjectStatus;
  currentStep: PipelineStep;
  stepState: StepState;
}

export interface ProjectDetail extends ProjectSummary {
  bookText: string;
  style: string | null;
  stepError: string | null;
  stepStartedAt: string | null;
  /** True once a RUNNING step has exceeded the stale threshold — see lib/pipeline/state.ts. */
  isStale: boolean;
  characters: CharacterDTO[];
  chapters: ChapterDTO[];
}
