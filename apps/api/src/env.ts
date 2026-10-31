import { z } from "zod";

// `KEY=` in .env.local means "not set", not an empty value.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  // Pooled Neon connection string (host contains "-pooler") for the app.
  DATABASE_URL: z.string().url(),
  // Neon Auth (managed Better Auth) for this branch.
  NEON_AUTH_BASE_URL: z.string().url(),
  NEON_AUTH_JWKS_URL: z.string().url(),
  // Upstash Redis: either a TLS URL, or the REST URL + token from the Upstash console.
  REDIS_URL: optional(z.string().url()),
  UPSTASH_REDIS_REST_URL: optional(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string().min(1)),
});

const parsed = EnvSchema.parse(process.env);

/**
 * BullMQ/ioredis need the TCP endpoint, not REST. Upstash serves both on the
 * same host, with the REST token as the password for user "default".
 */
function resolveRedisUrl(): string | undefined {
  if (parsed.REDIS_URL) return parsed.REDIS_URL;
  if (parsed.UPSTASH_REDIS_REST_URL && parsed.UPSTASH_REDIS_REST_TOKEN) {
    const host = new URL(parsed.UPSTASH_REDIS_REST_URL).hostname;
    return `rediss://default:${encodeURIComponent(parsed.UPSTASH_REDIS_REST_TOKEN)}@${host}:6379`;
  }
  return undefined;
}

export const env = { ...parsed, redisUrl: resolveRedisUrl() };
