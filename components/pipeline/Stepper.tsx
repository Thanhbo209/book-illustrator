import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXECUTABLE_STEPS, type ExecutableStep, type PipelineStep, type StepState } from "@/types/pipeline";

const STEP_TITLES: Record<ExecutableStep, string> = {
  STYLE: "Style",
  CHARACTERS: "Characters",
  PORTRAITS: "Portraits",
  CHAPTERS: "Chapters",
  ILLUSTRATIONS: "Illustrations",
};

type StepStatus = "done" | "current" | "pending";

interface StepperProps {
  currentStep: PipelineStep;
  stepState: StepState;
  className?: string;
}

function statusFor(step: ExecutableStep, currentStep: PipelineStep): StepStatus {
  if (currentStep === "DONE") return "done";
  const currentIndex = EXECUTABLE_STEPS.indexOf(currentStep as ExecutableStep);
  const stepIndex = EXECUTABLE_STEPS.indexOf(step);
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "current";
  return "pending";
}

export function Stepper({ currentStep, stepState, className }: StepperProps) {
  return (
    <ol className={cn("flex w-full items-start", className)}>
      {EXECUTABLE_STEPS.map((step, index) => {
        const status = statusFor(step, currentStep);
        const isFailed = status === "current" && stepState === "FAILED";
        const isRunning = status === "current" && stepState === "RUNNING";
        const isFirst = index === 0;
        const isLast = index === EXECUTABLE_STEPS.length - 1;
        // A step is reached (connector leading into it is complete) once
        // it's done or current — everything before "current" is done by
        // definition of statusFor's monotonic ordering.
        const isReached = status === "done" || status === "current";
        // Connector segments live in the same row as the marker and are
        // equal flex-1 widths on both sides, so the marker — and the
        // label centered beneath the whole column — land on the same
        // horizontal axis instead of drifting toward the connector line.
        const connectorClass = (filled: boolean) =>
          cn("h-px min-w-2 flex-1", filled ? "bg-primary" : "bg-border");

        return (
          <li key={step} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <div className={isFirst ? "flex-1" : connectorClass(isReached)} />
              <div
                aria-current={status === "current" ? "step" : undefined}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  status === "done" && "border-primary bg-primary text-primary-foreground",
                  status === "current" &&
                    !isFailed &&
                    "border-primary text-primary ring-2 ring-primary/20",
                  isFailed && "border-destructive text-destructive ring-2 ring-destructive/20",
                  status === "pending" && "border-border text-muted-foreground",
                )}
              >
                {status === "done" ? <Check className="size-4" /> : index + 1}
              </div>
              <div className={isLast ? "flex-1" : connectorClass(status === "done")} />
            </div>
            <span
              className={cn(
                "max-w-full truncate px-0.5 text-center text-[11px] leading-tight sm:text-xs",
                isFailed && "font-medium text-destructive",
                !isFailed && status === "current" && "font-medium text-foreground",
                !isFailed && status !== "current" && "text-muted-foreground",
              )}
            >
              {STEP_TITLES[step]}
            </span>
            {isRunning || isFailed ? (
              <span
                className={cn(
                  "text-[10px] leading-none",
                  isFailed ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {isFailed ? "Failed" : "Running"}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
