/**
 * Shared system instructions for every image-generation call (portraits and
 * illustrations) — mirrors the notebook's `system_instructions` constant,
 * passed via the verified `system_instruction` field rather than baked
 * into each prompt string, so it's defined once instead of duplicated.
 */
export const IMAGE_SYSTEM_INSTRUCTIONS =
  "There must be no text in the image — it should not look like a book cover. " +
  "Produce a single full illustration with no borders, panels, or captions. " +
  "Keep it family-friendly with warm, uplifting colors.";
