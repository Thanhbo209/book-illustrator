export const PIPELINE_STEPS = [
  "STYLE",
  "CHARACTERS",
  "PORTRAITS",
  "CHAPTERS",
  "ILLUSTRATIONS",
  "DONE",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/** Steps a user can explicitly execute (excludes the terminal DONE state). */
export const EXECUTABLE_STEPS = PIPELINE_STEPS.filter(
  (step): step is Exclude<PipelineStep, "DONE"> => step !== "DONE",
);

export type ExecutableStep = (typeof EXECUTABLE_STEPS)[number];

export type StepState = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";

export type ProjectStatus = "DRAFT" | "IN_PROGRESS" | "DONE";

export const STEP_LABELS: Record<ExecutableStep, string> = {
  STYLE: "Generating art style...",
  CHARACTERS: "Generating characters...",
  PORTRAITS: "Generating character portraits...",
  CHAPTERS: "Generating chapter...",
  ILLUSTRATIONS: "Generating illustration...",
};
