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

        return (
          <li key={step} className="flex flex-1 flex-col items-center gap-2 last:flex-none">
            <div className="flex w-full items-center">
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
              {index < EXECUTABLE_STEPS.length - 1 ? (
                <div
                  className={cn(
                    "mx-1 h-px flex-1",
                    status === "done" ? "bg-primary" : "bg-border",
                  )}
                />
              ) : null}
            </div>
            <span
              className={cn(
                "text-xs",
                status === "current" ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {STEP_TITLES[step]}
              {isRunning ? " · running" : null}
              {isFailed ? " · failed" : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
