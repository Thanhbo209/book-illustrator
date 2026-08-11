import { z } from "zod";

export const styleStepSchema = z.object({
  style: z
    .string()
    .trim()
    .min(1, "Style cannot be empty")
    .max(500, "Style is too long")
    .optional(),
});
