import { createNeonAuth } from "@neon/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});

type TokenResult = { data: { token: string } | null; error: { message?: string } | null };

// The server exposes the JWT plugin's GET /token endpoint at runtime, but
// @neon/auth 0.8.2 types it as `unknown`. Returns a short-lived EdDSA JWT for
// calling apps/api with `Authorization: Bearer`.
export function getApiToken(): Promise<TokenResult> {
  return (auth as unknown as { token: () => Promise<TokenResult> }).token();
}
