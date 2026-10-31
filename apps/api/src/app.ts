import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyBaseLogger, type FastifyServerOptions } from "fastify";
import type { Redis } from "ioredis";
import type { Db } from "./db/client.js";
import { registerErrorHandler } from "./lib/errors.js";
import { createAuthGuards, type TokenVerifier } from "./plugins/auth.js";
import { merchantRoutes } from "./routes/merchants.js";
import { voiceLimits, voiceRoutes } from "./routes/voice.js";
import type { FileStorage } from "./services/storage.js";
import type { AiServices } from "./services/types.js";

export type AppDeps = {
  db: Db;
  redis: Redis | null;
  verifyToken: TokenVerifier;
  webOrigin: string;
  storage: FileStorage;
  /** AI providers, or a factory that receives the app's logger. */
  ai: AiServices | ((log: FastifyBaseLogger) => AiServices);
  logger?: FastifyServerOptions["logger"];
};

/** Builds the API without listening, so tests can inject requests and stub auth/AI. */
export async function buildApp({ db, redis, verifyToken, webOrigin, storage, ai, logger = false }: AppDeps) {
  const app = Fastify({ logger, genReqId: () => crypto.randomUUID() });
  await app.register(cors, { origin: webOrigin, methods: ["GET", "POST", "PATCH", "DELETE"] });
  await app.register(multipart, { limits: voiceLimits });
  registerErrorHandler(app);

  const guards = createAuthGuards(db, verifyToken);
  const aiServices = typeof ai === "function" ? ai(app.log) : ai;

  app.get("/health", async (_req, reply) => {
    const [postgres, redisStatus] = await Promise.all([checkPostgres(), checkRedis()]);
    const ok = postgres.ok && redisStatus.ok;
    return reply.code(ok ? 200 : 503).send({ ok, postgres, redis: redisStatus, aiMock: aiServices.mock });
  });

  async function checkPostgres() {
    try {
      const result = await db.execute<{ now: string }>(sql`select now() as now`);
      return { ok: true, now: result.rows[0]?.now };
    } catch (err) {
      app.log.error({ err: (err as Error).message }, "postgres health check failed");
      return { ok: false };
    }
  }

  async function checkRedis() {
    if (!redis) return { ok: false, configured: false };
    try {
      const started = Date.now();
      const pong = await redis.ping();
      return { ok: pong === "PONG", configured: true, ms: Date.now() - started };
    } catch (err) {
      app.log.error({ err: (err as Error).message }, "redis health check failed");
      return { ok: false, configured: true };
    }
  }

  merchantRoutes(app, db, guards);
  voiceRoutes(app, { db, ai: aiServices, storage, guards });
  return app;
}
