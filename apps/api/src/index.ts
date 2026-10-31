import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";
import { env } from "./env.js";
import { neonAuthVerifier } from "./plugins/auth.js";
import { redis } from "./redis.js";

const { db, pool } = createDb(env.DATABASE_URL);

const app = await buildApp({
  db,
  redis,
  verifyToken: neonAuthVerifier(env.NEON_AUTH_JWKS_URL, env.NEON_AUTH_BASE_URL),
  webOrigin: env.WEB_ORIGIN,
  logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
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
