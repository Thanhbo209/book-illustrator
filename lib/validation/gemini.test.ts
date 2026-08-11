// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  chaptersResponseSchema,
  charactersResponseSchema,
  toGeminiSchema,
} from "@/lib/validation/gemini";

describe("charactersResponseSchema", () => {
  it("accepts 1 or 2 well-formed characters", () => {
    expect(charactersResponseSchema.safeParse([{ name: "Mole", prompt: "a mole" }]).success).toBe(
      true,
    );
    expect(
      charactersResponseSchema.safeParse([
        { name: "Mole", prompt: "a mole" },
        { name: "Toad", prompt: "a toad" },
      ]).success,
    ).toBe(true);
  });

  it("rejects more than 2 characters", () => {
    const result = charactersResponseSchema.safeParse([
      { name: "A", prompt: "a" },
      { name: "B", prompt: "b" },
      { name: "C", prompt: "c" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects an empty list", () => {
    expect(charactersResponseSchema.safeParse([]).success).toBe(false);
  });

  it("rejects malformed items", () => {
    expect(charactersResponseSchema.safeParse([{ name: "Mole" }]).success).toBe(false);
    expect(charactersResponseSchema.safeParse("not an array").success).toBe(false);
  });
});

describe("chaptersResponseSchema", () => {
  it("accepts exactly 1 chapter", () => {
    expect(chaptersResponseSchema.safeParse([{ title: "Ch1", prompt: "a scene" }]).success).toBe(
      true,
    );
  });

  it("rejects 0 or 2+ chapters", () => {
    expect(chaptersResponseSchema.safeParse([]).success).toBe(false);
    expect(
      chaptersResponseSchema.safeParse([
        { title: "Ch1", prompt: "a" },
        { title: "Ch2", prompt: "b" },
      ]).success,
    ).toBe(false);
  });
});

describe("toGeminiSchema", () => {
  it("strips $schema and keeps the JSON Schema shape Gemini expects", () => {
    const json = toGeminiSchema(charactersResponseSchema);
    expect(json.$schema).toBeUndefined();
    expect(json.type).toBe("array");
    expect(json.maxItems).toBe(2);
  });
});
