import { describe, expect, it } from "vitest";
import { canClaim, deriveProjectStatus, isStale, nextStep, STALE_MS } from "@/lib/pipeline/state";

describe("isStale", () => {
  it("is false when idle", () => {
    expect(isStale({ stepState: "IDLE", stepStartedAt: null })).toBe(false);
  });

  it("is false for a fresh RUNNING step", () => {
    const now = new Date();
    const startedAt = new Date(now.getTime() - 1000);
    expect(isStale({ stepState: "RUNNING", stepStartedAt: startedAt }, now)).toBe(false);
  });

  it("is true once a RUNNING step exceeds the stale threshold", () => {
    const now = new Date();
    const startedAt = new Date(now.getTime() - STALE_MS - 1);
    expect(isStale({ stepState: "RUNNING", stepStartedAt: startedAt }, now)).toBe(true);
  });
});

describe("canClaim", () => {
  it("allows claiming IDLE and FAILED steps", () => {
    expect(canClaim({ stepState: "IDLE", stepStartedAt: null })).toBe(true);
    expect(canClaim({ stepState: "FAILED", stepStartedAt: null })).toBe(true);
  });

  it("blocks a fresh RUNNING step", () => {
    const now = new Date();
    const startedAt = new Date(now.getTime() - 1000);
    expect(canClaim({ stepState: "RUNNING", stepStartedAt: startedAt }, now)).toBe(false);
  });

  it("allows reclaiming a stale RUNNING step", () => {
    const now = new Date();
    const startedAt = new Date(now.getTime() - STALE_MS - 1);
    expect(canClaim({ stepState: "RUNNING", stepStartedAt: startedAt }, now)).toBe(true);
  });

  it("blocks a COMPLETED step", () => {
    expect(canClaim({ stepState: "COMPLETED", stepStartedAt: null })).toBe(false);
  });
});

describe("nextStep", () => {
  it("walks the pipeline in order and ends at DONE", () => {
    expect(nextStep("STYLE")).toBe("CHARACTERS");
    expect(nextStep("CHARACTERS")).toBe("PORTRAITS");
    expect(nextStep("PORTRAITS")).toBe("CHAPTERS");
    expect(nextStep("CHAPTERS")).toBe("ILLUSTRATIONS");
    expect(nextStep("ILLUSTRATIONS")).toBe("DONE");
  });
});

describe("deriveProjectStatus", () => {
  it("is DRAFT for a brand-new project", () => {
    expect(deriveProjectStatus({ currentStep: "STYLE", stepState: "IDLE" })).toBe("DRAFT");
  });

  it("is IN_PROGRESS once style generation has started or any step is mid-pipeline", () => {
    expect(deriveProjectStatus({ currentStep: "STYLE", stepState: "RUNNING" })).toBe("IN_PROGRESS");
    expect(deriveProjectStatus({ currentStep: "CHARACTERS", stepState: "IDLE" })).toBe("IN_PROGRESS");
    expect(deriveProjectStatus({ currentStep: "ILLUSTRATIONS", stepState: "FAILED" })).toBe(
      "IN_PROGRESS",
    );
  });

  it("is DONE once the pipeline has finished", () => {
    expect(deriveProjectStatus({ currentStep: "DONE", stepState: "IDLE" })).toBe("DONE");
  });
});
