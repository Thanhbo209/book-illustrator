// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseGeneratedImage } from "@/lib/gemini/imageResponse";
import { GeminiResponseShapeError } from "@/lib/gemini/errors";
import type { InteractionResponse } from "@/lib/gemini/client";

function responseWithContent(content: InteractionResponse["steps"][number]["content"]): InteractionResponse {
  return {
    id: "1",
    status: "completed",
    model: "gemini-3.1-flash-image",
    object: "interaction",
    steps: [{ type: "model_output", content }],
  };
}

describe("parseGeneratedImage", () => {
  it("extracts base64 data and mime type from a well-formed response", () => {
    const image = parseGeneratedImage(
      responseWithContent([{ type: "image", data: "aGVsbG8=", mime_type: "image/png" }]),
    );
    expect(image).toEqual({ data: "aGVsbG8=", mimeType: "image/png" });
  });

  it("throws when there is no image content item", () => {
    expect(() =>
      parseGeneratedImage(responseWithContent([{ type: "text", text: "no image here" }])),
    ).toThrow(GeminiResponseShapeError);
  });

  it("throws when there is no model_output step at all", () => {
    expect(() =>
      parseGeneratedImage({
        id: "1",
        status: "completed",
        model: "x",
        object: "interaction",
        steps: [{ type: "thought" }],
      }),
    ).toThrow(GeminiResponseShapeError);
  });

  it("throws when data is missing", () => {
    expect(() =>
      parseGeneratedImage(responseWithContent([{ type: "image", mime_type: "image/png" }])),
    ).toThrow(/base64/);
  });

  it("throws when data is not valid base64", () => {
    expect(() =>
      parseGeneratedImage(
        responseWithContent([{ type: "image", data: "not base64 at all!!", mime_type: "image/png" }]),
      ),
    ).toThrow(/base64/);
  });

  it("throws when mime_type is missing or not an image type", () => {
    expect(() =>
      parseGeneratedImage(responseWithContent([{ type: "image", data: "aGVsbG8=", mime_type: "text/plain" }])),
    ).toThrow(/mime_type/);
  });
});
