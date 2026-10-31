import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Db } from "../db/client.js";
import { findMembership, type Membership } from "../db/repos/merchants.js";
import { AppError, unauthorized } from "../lib/errors.js";

export type AuthUser = { id: string; email: string | null };

/** Turns a bearer token into the signed-in user, or throws. */
export type TokenVerifier = (token: string) => Promise<AuthUser>;

/**
 * Neon Auth issues EdDSA JWTs (15 min expiry). The web app fetches one with
 * `getApiToken()` and sends it as `Authorization: Bearer <jwt>`.
 */
export function neonAuthVerifier(jwksUrl: string, baseUrl: string): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  const issuer = new URL(baseUrl).origin;
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (!payload.sub) throw new Error("token has no sub");
    return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
  };
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
    membership?: Membership;
  }
}

/**
 * preHandlers, in increasing strictness:
 * - authenticate: valid token (onboarding, GET /me)
 * - requireMerchant: token + belongs to a shop; sets req.membership (all shop data)
 * - requireOwner: + role owner (settings, credit, loans; helpers get 403 per §17)
 */
export function createAuthGuards(db: Db, verifyToken: TokenVerifier) {
  async function authenticate(req: FastifyRequest) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    try {
      req.authUser = await verifyToken(header.slice("Bearer ".length));
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, "token verification failed");
      throw unauthorized("Session expire ho gaya, dobara login karein (Session expired)");
    }
  }

  async function requireMerchant(req: FastifyRequest, _reply: FastifyReply) {
    await authenticate(req);
    const membership = await findMembership(db, req.authUser!.id);
    if (!membership) {
      throw new AppError(
        403,
        "ONBOARDING_REQUIRED",
        "Pehle dukaan ki jaankari bharein (Finish shop setup first)",
      );
    }
    req.membership = membership;
  }

  async function requireOwner(req: FastifyRequest, reply: FastifyReply) {
    await requireMerchant(req, reply);
    if (req.membership!.role !== "owner") {
      throw new AppError(
        403,
        "OWNER_ONLY",
        "Yeh sirf dukaan ke maalik dekh sakte hain (Only the shop owner can do this)",
      );
    }
  }

  return { authenticate, requireMerchant, requireOwner };
}

export type AuthGuards = ReturnType<typeof createAuthGuards>;
