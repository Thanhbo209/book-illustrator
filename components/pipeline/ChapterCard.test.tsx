import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChapterCard } from "@/components/pipeline/ChapterCard";
import type { ChapterDTO } from "@/types/domain";

function chapter(overrides: Partial<ChapterDTO> = {}): ChapterDTO {
  return {
    id: "chapter-1",
    order: 1,
    title: "River Bank",
    prompt: "Mole and Rat share a picnic by the river",
    illustrationUrl: null,
    illustrationState: "IDLE",
    illustrationError: null,
    ...overrides,
  };
}

describe("ChapterCard", () => {
  it("shows a generating indicator while the illustration is RUNNING", () => {
    render(<ChapterCard chapter={chapter({ illustrationState: "RUNNING" })} />);
    expect(screen.getByText("Generating...")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the failure badge and message when the illustration FAILED", () => {
    render(
      <ChapterCard
        chapter={chapter({ illustrationState: "FAILED", illustrationError: "Gemini quota exceeded" })}
      />,
    );
    expect(screen.getByText("Illustration failed")).toBeInTheDocument();
    expect(screen.getByText("Gemini quota exceeded")).toBeInTheDocument();
  });

  it("renders the illustration image once COMPLETED", () => {
    render(
      <ChapterCard
        chapter={chapter({
          illustrationState: "COMPLETED",
          illustrationUrl: "/api/projects/p1/image/chapter/1",
        })}
      />,
    );
    expect(screen.getByRole("img", { name: "Illustration for River Bank" })).toBeInTheDocument();
  });
});
