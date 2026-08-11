import {
  EXECUTABLE_STEPS,
  PIPELINE_STEPS,
  type ExecutableStep,
  type PipelineStep,
  type ProjectStatus,
  type StepState,
} from "@/types/pipeline";

/** How long a RUNNING step can go without an update before it's considered stranded. */
export const STALE_MS = 3 * 60 * 1000;

export interface StepLike {
  stepState: StepState;
  stepStartedAt: Date | null;
}

export function isStale(step: StepLike, now: Date = new Date()): boolean {
  if (step.stepState !== "RUNNING" || !step.stepStartedAt) return false;
  return now.getTime() - step.stepStartedAt.getTime() > STALE_MS;
}

/** True if the step is IDLE, FAILED, or a stale RUNNING — i.e. safe to (re)claim. */
export function canClaim(step: StepLike, now: Date = new Date()): boolean {
  if (step.stepState === "IDLE" || step.stepState === "FAILED") return true;
  return isStale(step, now);
}

export function nextStep(step: ExecutableStep): PipelineStep {
  const index = EXECUTABLE_STEPS.indexOf(step);
  return PIPELINE_STEPS[index + 1];
}

export interface ProjectStatusLike {
  currentStep: PipelineStep;
  stepState: StepState;
}

export function deriveProjectStatus(project: ProjectStatusLike): ProjectStatus {
  if (project.currentStep === "DONE") return "DONE";
  if (project.currentStep === "STYLE" && project.stepState === "IDLE") return "DRAFT";
  return "IN_PROGRESS";
}
