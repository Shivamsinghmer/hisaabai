import { Redis } from "ioredis";
import { env } from "./env.js";

// One shared connection for cache and health checks. BullMQ workers (Phase 5)
// create their own connections from env.redisUrl with the same options.
export const redisOptions = {
  // Required by BullMQ; also keeps commands waiting through brief reconnects.
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
} as const;

export const redis = env.redisUrl ? new Redis(env.redisUrl, redisOptions) : null;

// Key prefix so branches/environments sharing one Upstash database never collide.
export const redisPrefix = `hisaab:${process.env.NEON_BRANCH ?? env.NODE_ENV}:`;
