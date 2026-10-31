import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { merchants } from "../src/db/schema.js";
import type { AuthUser, TokenVerifier } from "../src/plugins/auth.js";

/**
 * Test tokens are "test:<authUserId>:<email>". The stub verifier stands in for
 * Neon Auth's JWKS check; everything after it (membership, roles, scoping) is real.
 */
export const fakeVerifier: TokenVerifier = async (token) => {
  const [prefix, id, email] = token.split(":");
  if (prefix !== "test" || !id) throw new Error("bad test token");
  return { id, email: email || null };
};

export function newAuthUser(label = "user"): AuthUser & { token: string } {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@test.hisaab.local`;
  return { id, email, token: `test:${id}:${email}` };
}

export const bearer = (user: { token: string }) => ({ authorization: `Bearer ${user.token}` });

export async function setupTestApp() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const app = await buildApp({
    db,
    redis: null,
    verifyToken: fakeVerifier,
    webOrigin: "http://localhost:3000",
  });
  const createdMerchantIds: string[] = [];

  return {
    app,
    db,
    track: (merchantId: string) => createdMerchantIds.push(merchantId),
    async close() {
      // Cascades to users, consents and all shop data.
      if (createdMerchantIds.length)
        await db.delete(merchants).where(inArray(merchants.id, createdMerchantIds));
      await app.close();
      await pool.end();
    },
  };
}

export const validOnboarding = {
  shopName: "Test General Store",
  ownerName: "Test Owner",
  language: "hi-IN",
  acceptedConsent: true,
} as const;
