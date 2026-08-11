import { z } from "zod";

export const loginSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export type LoginInput = z.infer<typeof loginSchema>;
