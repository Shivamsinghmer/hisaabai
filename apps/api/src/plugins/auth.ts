import { apiError } from "@hisaab/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../env.js";

// Neon Auth issues EdDSA JWTs (15 min expiry). The web app fetches one with
// `auth.token()` and sends it as `Authorization: Bearer <jwt>`.
const jwks = createRemoteJWKSet(new URL(env.NEON_AUTH_JWKS_URL));
const issuer = new URL(env.NEON_AUTH_BASE_URL).origin;

export type AuthUser = { id: string; email?: string };

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

function unauthorized(reply: FastifyReply, message: string) {
  return reply.code(401).send(apiError("UNAUTHORIZED", message));
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return unauthorized(reply, "Login zaroori hai (missing bearer token)");
  }
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(header.slice("Bearer ".length), jwks, { issuer }));
  } catch (err) {
    req.log.warn({ err: (err as Error).message }, "jwt verification failed");
    return unauthorized(reply, "Session expire ho gaya, dobara login karein");
  }
  if (!payload.sub) return unauthorized(reply, "Invalid token");
  req.authUser = {
    id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
