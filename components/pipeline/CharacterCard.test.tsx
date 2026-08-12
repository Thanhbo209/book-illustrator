import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CharacterCard } from "@/components/pipeline/CharacterCard";
import type { CharacterDTO } from "@/types/domain";

function character(overrides: Partial<CharacterDTO> = {}): CharacterDTO {
  return {
    id: "char-1",
    order: 1,
    name: "Mole",
    prompt: "a small, gentle mole",
    portraitUrl: null,
    portraitState: "IDLE",
    portraitError: null,
    ...overrides,
  };
}

describe("CharacterCard", () => {
  it("shows a generating indicator while the portrait is RUNNING, with the mock portrait as the visual", () => {
    render(<CharacterCard character={character({ portraitState: "RUNNING" })} />);
    expect(screen.getByText("Generating...")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Placeholder portrait for Mole" })).toBeInTheDocument();
  });

  it("shows the failure badge, the mock portrait, and a secondary error message when the portrait FAILED", () => {
    render(
      <CharacterCard
        character={character({ portraitState: "FAILED", portraitError: "Gemini quota exceeded" })}
      />,
    );
    expect(screen.getByText("Portrait failed")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Placeholder portrait for Mole" })).toBeInTheDocument();
    // The raw error stays available, but only as secondary/compact text —
    // never as the primary portrait visual.
    expect(screen.getByText("Gemini quota exceeded")).toBeInTheDocument();
  });

  it("renders the portrait image once COMPLETED", () => {
    render(
      <CharacterCard
        character={character({
          portraitState: "COMPLETED",
          portraitUrl: "/api/projects/p1/image/character/1",
        })}
      />,
    );
    const image = screen.getByRole("img", { name: "Portrait of Mole" });
    expect(image).toBeInTheDocument();
    expect(screen.queryByText("Generating...")).not.toBeInTheDocument();
    expect(screen.queryByText("Portrait failed")).not.toBeInTheDocument();
  });

  it("shows the mock portrait but no state indicator while IDLE (nothing generated yet)", () => {
    render(<CharacterCard character={character()} />);
    expect(screen.queryByText("Generating...")).not.toBeInTheDocument();
    expect(screen.queryByText("Portrait failed")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Placeholder portrait for Mole" })).toBeInTheDocument();
  });
});
