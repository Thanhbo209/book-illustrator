import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PortraitsStepPanel } from "@/components/pipeline/PortraitsStepPanel";
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
    currentStep: "PORTRAITS",
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

describe("PortraitsStepPanel", () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders nothing when Portraits isn't the current step", () => {
    const { container } = render(<PortraitsStepPanel project={project({ currentStep: "CHAPTERS" })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the specific running label, not a generic spinner", () => {
    render(<PortraitsStepPanel project={project({ stepState: "RUNNING" })} />);
    expect(screen.getByText("Generating character portraits...")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("shows the error and a Retry button when FAILED", () => {
    render(
      <PortraitsStepPanel
        project={project({ stepState: "FAILED", stepError: "Gemini quota exceeded" })}
      />,
    );
    expect(screen.getByText("Gemini quota exceeded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows a stuck-step banner and Recover button when RUNNING but stale", () => {
    render(<PortraitsStepPanel project={project({ stepState: "RUNNING", isStale: true })} />);
    expect(screen.getByText(/looks stuck/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recover step" })).toBeInTheDocument();
  });

  it("polls while its own request is in flight (Decision #2)", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));
    vi.useFakeTimers();

    render(<PortraitsStepPanel project={project()} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate portraits" }));

    // The fetch is still unresolved — props still say IDLE — but the panel
    // should be polling anyway because it knows *it* just submitted.
    await vi.advanceTimersByTimeAsync(3000);
    expect(refresh).toHaveBeenCalled();

    resolveFetch(new Response(JSON.stringify({ project: project() }), { status: 200 }));
    await vi.runOnlyPendingTimersAsync();
  });
});
