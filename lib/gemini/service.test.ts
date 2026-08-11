// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InteractionResponse } from "@/lib/gemini/client";

vi.mock("@/lib/gemini/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gemini/client")>();
  return {
    ...actual,
    createInteraction: vi.fn(),
    uploadFile: vi.fn(),
  };
});

import { createInteraction, uploadFile } from "@/lib/gemini/client";
import { GeminiResponseShapeError } from "@/lib/gemini/errors";
import {
  generateCharacters,
  generateChapters,
  generateIllustration,
  generatePortrait,
  generateStyle,
  uploadBookText,
} from "@/lib/gemini/service";

const createInteractionMock = vi.mocked(createInteraction);
const uploadFileMock = vi.mocked(uploadFile);

function textResponse(text: string, id = "int-1"): InteractionResponse {
  return {
    id,
    status: "completed",
    model: "gemini-3.6-flash",
    object: "interaction",
    steps: [{ type: "model_output", content: [{ type: "text", text }] }],
  };
}

function imageResponse(data: string, mimeType: string, id = "int-img"): InteractionResponse {
  return {
    id,
    status: "completed",
    model: "gemini-3.1-flash-image",
    object: "interaction",
    steps: [{ type: "model_output", content: [{ type: "image", data, mime_type: mimeType }] }],
  };
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_TEXT_MODEL = "gemini-3.6-flash";
  process.env.GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
  createInteractionMock.mockReset();
  uploadFileMock.mockReset();
});

describe("uploadBookText", () => {
  it("uploads the book text as a text/plain file", async () => {
    uploadFileMock.mockResolvedValue({
      uri: "files/abc",
      mimeType: "text/plain",
      expiresAt: new Date("2026-01-01"),
    });

    const result = await uploadBookText("Once upon a time...");

    expect(result.uri).toBe("files/abc");
    const call = uploadFileMock.mock.calls[0][0];
    expect(call.mimeType).toBe("text/plain");
    expect(call.content.toString("utf-8")).toBe("Once upon a time...");
  });
});

describe("generateStyle", () => {
  it("attaches the book document and returns the generated style", async () => {
    createInteractionMock.mockResolvedValue(textResponse("A warm watercolor style."));

    const result = await generateStyle({ bookFileUri: "files/abc", bookFileMimeType: "text/plain" });

    expect(result.style).toBe("A warm watercolor style.");
    expect(result.interactionId).toBe("int-1");
    const call = createInteractionMock.mock.calls[0][0];
    expect(call.previousInteractionId).toBeUndefined();
    expect(call.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "document", uri: "files/abc", mime_type: "text/plain" }),
      ]),
    );
  });

  it("preserves a user-provided style instead of asking Gemini to invent one", async () => {
    createInteractionMock.mockResolvedValue(textResponse("Bold ink-wash style, as requested."));

    await generateStyle({
      bookFileUri: "files/abc",
      bookFileMimeType: "text/plain",
      userStyle: "Bold ink-wash",
    });

    const call = createInteractionMock.mock.calls[0][0];
    const textItem = (call.input as Array<{ type: string; text?: string }>).find(
      (item) => item.type === "text",
    );
    expect(textItem?.text).toContain("Bold ink-wash");
  });
});

describe("generateCharacters", () => {
  it("chains from the previous interaction and returns validated characters", async () => {
    createInteractionMock.mockResolvedValue(
      textResponse(JSON.stringify([{ name: "Mole", prompt: "a small mole" }])),
    );

    const result = await generateCharacters({ previousInteractionId: "style-int" });

    expect(result.characters).toEqual([{ name: "Mole", prompt: "a small mole" }]);
    const call = createInteractionMock.mock.calls[0][0];
    expect(call.previousInteractionId).toBe("style-int");
    expect(call.responseSchema).toBeDefined();
  });

  it("throws GeminiResponseShapeError when Gemini returns non-JSON", async () => {
    createInteractionMock.mockResolvedValue(textResponse("not json"));
    await expect(generateCharacters({ previousInteractionId: "x" })).rejects.toThrow(
      GeminiResponseShapeError,
    );
  });

  it("throws GeminiResponseShapeError when Gemini returns more than 2 characters", async () => {
    createInteractionMock.mockResolvedValue(
      textResponse(
        JSON.stringify([
          { name: "A", prompt: "a" },
          { name: "B", prompt: "b" },
          { name: "C", prompt: "c" },
        ]),
      ),
    );
    await expect(generateCharacters({ previousInteractionId: "x" })).rejects.toThrow(
      GeminiResponseShapeError,
    );
  });
});

describe("generateChapters", () => {
  it("references character names and returns exactly one validated chapter", async () => {
    createInteractionMock.mockResolvedValue(
      textResponse(JSON.stringify([{ title: "River Bank", prompt: "Mole and Rat by the river" }])),
    );

    const result = await generateChapters({
      previousInteractionId: "characters-int",
      characters: [{ name: "Mole" }, { name: "Rat" }],
    });

    expect(result.chapters).toEqual([{ title: "River Bank", prompt: "Mole and Rat by the river" }]);
    const call = createInteractionMock.mock.calls[0][0];
    expect(call.input).toContain("Mole, Rat");
  });
});

describe("generatePortrait", () => {
  it("returns the generated image and interaction id, without chaining", async () => {
    createInteractionMock.mockResolvedValue(imageResponse("aGVsbG8=", "image/png"));

    const result = await generatePortrait({
      character: { name: "Mole", prompt: "a small mole" },
      style: "watercolor",
    });

    expect(result.image).toEqual({ data: "aGVsbG8=", mimeType: "image/png" });
    expect(result.interactionId).toBe("int-img");
    const call = createInteractionMock.mock.calls[0][0];
    expect(call.previousInteractionId).toBeUndefined();
    expect(call.systemInstruction).toBeTruthy();
  });

  it("propagates a shape error if Gemini doesn't return an image", async () => {
    createInteractionMock.mockResolvedValue(textResponse("I can't draw that."));
    await expect(
      generatePortrait({
        character: { name: "Mole", prompt: "a mole" },
        style: "watercolor",
      }),
    ).rejects.toThrow(GeminiResponseShapeError);
  });
});

describe("generateIllustration", () => {
  it("passes character portraits as image inputs alongside the chapter prompt, without chaining", async () => {
    createInteractionMock.mockResolvedValue(imageResponse("aW1hZ2U=", "image/png"));

    const result = await generateIllustration({
      chapter: { title: "River Bank", prompt: "a picnic scene" },
      style: "watercolor",
      characterPortraits: [{ name: "Mole", data: "cG9ydHJhaXQ=", mimeType: "image/png" }],
    });

    expect(result.image.mimeType).toBe("image/png");
    const call = createInteractionMock.mock.calls[0][0];
    expect(call.previousInteractionId).toBeUndefined();
    expect(call.systemInstruction).toBeTruthy();
    const input = call.input as Array<{ type: string; data?: string }>;
    expect(input.some((item) => item.type === "image" && item.data === "cG9ydHJhaXQ=")).toBe(true);
  });
});
