"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { STEP_LABELS } from "@/types/pipeline";
import type { ProjectDetail } from "@/types/domain";
import type { ApiErrorBody } from "@/types/api";

const POLL_INTERVAL_MS = 3000;

export function StyleStepPanel({ project }: { project: ProjectDetail }) {
  const router = useRouter();
  const [userStyle, setUserStyle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning = project.stepState === "RUNNING" && !project.isStale;
  const isStale = project.stepState === "RUNNING" && project.isStale;
  const isFailed = project.stepState === "FAILED";

  // Another tab (or this one, after a refresh) may have started the step —
  // poll until it leaves RUNNING so this view catches up without a manual reload.
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isRunning, router]);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const trimmed = userStyle.trim();
      const response = await fetch(`/api/projects/${project.id}/steps/style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trimmed ? { style: trimmed } : {}),
      });

      if (!response.ok && response.status !== 409) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setError(body?.error.message ?? "Something went wrong. Please try again.");
        return;
      }

      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (project.currentStep !== "STYLE") return null;

  if (isSubmitting || isRunning) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-primary" />
        {STEP_LABELS.STYLE}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isStale ? (
        <Alert>
          <AlertDescription>
            This step looks stuck — the server may have restarted mid-generation.
          </AlertDescription>
        </Alert>
      ) : null}
      {isFailed && project.stepError ? (
        <Alert variant="destructive">
          <AlertDescription>{project.stepError}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="userStyle">Art style (optional)</Label>
        <Input
          id="userStyle"
          placeholder="Leave empty to let Gemini choose a style"
          value={userStyle}
          onChange={(event) => setUserStyle(event.target.value)}
        />
      </div>

      <Button onClick={submit} className="self-start">
        {isStale ? "Recover step" : isFailed ? "Retry" : "Generate style"}
      </Button>
    </div>
  );
}
