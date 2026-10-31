import cors from "@fastify/cors";
import { sql } from "drizzle-orm";
import Fastify from "fastify";
import { db, pool } from "./db/client.js";
import { env } from "./env.js";
import { requireAuth } from "./plugins/auth.js";
import { redis } from "./redis.js";

const app = Fastify({
  logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
  genReqId: () => crypto.randomUUID(),
});

await app.register(cors, { origin: env.WEB_ORIGIN });

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

app.get("/health", async (_req, reply) => {
  const [postgres, redisStatus] = await Promise.all([checkPostgres(), checkRedis()]);
  const ok = postgres.ok && redisStatus.ok;
  return reply.code(ok ? 200 : 503).send({ ok, postgres, redis: redisStatus });
});

app.get("/me", { preHandler: requireAuth }, async (req) => {
  // Neon Auth keeps users in the neon_auth schema on the same branch.
  const result = await db.execute<{ id: string; name: string | null; created_at: string }>(
    sql`select id, name, "createdAt" as created_at from neon_auth."user" where id = ${req.authUser!.id}`,
  );
  return { authUser: req.authUser, dbUser: result.rows[0] ?? null };
});

const shutdown = async () => {
  await app.close();
  await pool.end();
  redis?.disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
