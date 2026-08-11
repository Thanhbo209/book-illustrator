import "server-only";

import type { InteractionResponse } from "@/lib/gemini/client";
import { GeminiResponseShapeError } from "@/lib/gemini/errors";

export interface GeneratedImage {
  data: string;
  mimeType: string;
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+=*$/;

/**
 * Parses an image out of an interaction response.
 *
 * This shape (`{ type: "image", data, mime_type }` inside the
 * `model_output` step) was inferred from the *input* image shape, which
 * was verified live — every image-generation model returned a 0-quota
 * error during verification, so the actual *output* shape was never
 * confirmed against a real response. Validate strictly and throw a
 * specific, diagnosable error rather than silently trusting an
 * unverified assumption (see DECISIONS.md).
 */
export function parseGeneratedImage(response: InteractionResponse): GeneratedImage {
  const outputStep = response.steps.find((step) => step.type === "model_output");
  const imageItem = outputStep?.content?.find((item) => item.type === "image");

  if (!imageItem) {
    const contentTypes = outputStep?.content?.map((item) => item.type) ?? [];
    throw new GeminiResponseShapeError(
      `Expected an "image" content item in the model_output step, found: ${JSON.stringify(contentTypes)}. ` +
        "The image-generation response shape was never verified live (quota-blocked) — this likely means the assumed shape is wrong and lib/gemini/imageResponse.ts needs updating.",
    );
  }

  if (
    typeof imageItem.data !== "string" ||
    imageItem.data.length === 0 ||
    !BASE64_PATTERN.test(imageItem.data)
  ) {
    throw new GeminiResponseShapeError(
      'Image content item is missing valid base64 "data".',
    );
  }

  if (typeof imageItem.mime_type !== "string" || !imageItem.mime_type.startsWith("image/")) {
    throw new GeminiResponseShapeError(
      'Image content item is missing a valid "mime_type".',
    );
  }

  return { data: imageItem.data, mimeType: imageItem.mime_type };
}
