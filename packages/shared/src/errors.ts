import { z } from "zod";

// Error shape for every API response (CLAUDE.md §11).
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    hint: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export function apiError(code: string, message: string, hint?: string): ApiError {
  return { error: hint ? { code, message, hint } : { code, message } };
}
