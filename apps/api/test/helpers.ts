import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { merchants } from "../src/db/schema.js";
import type { AuthUser, TokenVerifier } from "../src/plugins/auth.js";
import { mockLlm, mockSpeech } from "../src/services/mock.js";
import { localStorage, type FileStorage } from "../src/services/storage.js";
import type { AiServices } from "../src/services/types.js";

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

/** Real Neon `test` DB, stubbed auth, offline AI mocks (unless `ai` is given), temp file storage. */
export async function setupTestApp(opts: { ai?: (storage: FileStorage) => AiServices } = {}) {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const uploadDir = mkdtempSync(join(tmpdir(), "hisaab-test-"));
  const storage = localStorage(uploadDir);
  const app = await buildApp({
    db,
    redis: null,
    storage,
    ai: opts.ai?.(storage) ?? { speech: mockSpeech(storage), llm: mockLlm(), mock: true },
    verifyToken: fakeVerifier,
    webOrigin: "http://localhost:3000",
  });
  const createdMerchantIds: string[] = [];

  return {
    app,
    db,
    storage,
    track: (merchantId: string) => createdMerchantIds.push(merchantId),
    async close() {
      // Cascades to users, consents and all shop data.
      if (createdMerchantIds.length)
        await db.delete(merchants).where(inArray(merchants.id, createdMerchantIds));
      await app.close();
      await pool.end();
      rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}

export const validOnboarding = {
  shopName: "Test General Store",
  ownerName: "Test Owner",
  language: "hi-IN",
  acceptedConsent: true,
} as const;

/** A multipart body with one audio file, for app.inject(). */
export function audioUpload(data: Buffer, mimeType = "audio/webm", extra: Record<string, string> = {}) {
  const boundary = `----hisaab${randomUUID()}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(extra)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="speech.webm"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}
