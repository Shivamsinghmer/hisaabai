import { createHash } from "node:crypto";
import type { Redis } from "ioredis";

/** Cache for AI results (§12): key = sha256 of provider/model + input. */
export interface AiCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export function cacheKey(...parts: (string | Buffer)[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\u0000");
  }
  return hash.digest("hex");
}

export function redisCache(redis: Redis, prefix: string): AiCache {
  return {
    async get(key) {
      try {
        return await redis.get(`${prefix}ai:${key}`);
      } catch {
        return null; // a cache outage must never break the request
      }
    },
    async set(key, value, ttlSeconds) {
      try {
        await redis.set(`${prefix}ai:${key}`, value, "EX", ttlSeconds);
      } catch {
        // ignore
      }
    },
  };
}

export function memoryCache(): AiCache & { size(): number } {
  const store = new Map<string, string>();
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
    },
    size: () => store.size,
  };
}
