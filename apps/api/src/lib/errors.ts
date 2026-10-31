import { apiError } from "@hisaab/shared";
import type { FastifyError, FastifyInstance } from "fastify";
import { z } from "zod";

/** An error with a §11 response shape. Messages are Hinglish-first for the merchant. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

export const unauthorized = (message = "Login zaroori hai (Please sign in)") =>
  new AppError(401, "UNAUTHORIZED", message);

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    throw new AppError(400, "VALIDATION_ERROR", `${where}${first?.message ?? "Invalid request"}`);
  }
  return result.data;
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send(apiError(err.code, err.message, err.hint));
    }
    if (err.validation || err.statusCode === 400) {
      return reply.code(400).send(apiError("BAD_REQUEST", err.message));
    }
    req.log.error({ err }, "unhandled error");
    return reply
      .code(500)
      .send(apiError("INTERNAL", "Kuch gadbad ho gayi, dobara koshish karein (Something went wrong)"));
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send(apiError("NOT_FOUND", "Not found")));
}
