import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CharactersStepPanel } from "@/components/pipeline/CharactersStepPanel";
import type { ProjectDetail } from "@/types/domain";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "p1",
    title: "The Wind in the Willows",
    createdAt: new Date().toISOString(),
    status: "IN_PROGRESS",
    currentStep: "CHARACTERS",
    stepState: "IDLE",
    bookText: "text",
    style: "Watercolor",
    stepError: null,
    stepStartedAt: null,
    isStale: false,
    characters: [],
    chapters: [],
    ...overrides,
  };
}

describe("CharactersStepPanel", () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows the specific running label", () => {
    render(<CharactersStepPanel project={project({ stepState: "RUNNING" })} />);
    expect(screen.getByText("Generating characters...")).toBeInTheDocument();
  });

  it("does NOT poll while its own request is in flight — Decision #2 scopes the polling fix to Portraits only", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));
    vi.useFakeTimers();

    render(<CharactersStepPanel project={project()} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate characters" }));

    // Unlike Portraits, this panel only polls off the prop-derived RUNNING
    // state, which hasn't updated yet (still IDLE) — so no refresh should
    // fire even though a request is in flight.
    await vi.advanceTimersByTimeAsync(3000);
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ project: project() }), { status: 200 }));
      await vi.runOnlyPendingTimersAsync();
    });
  });
});
