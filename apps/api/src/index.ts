import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";
import { env } from "./env.js";
import { neonAuthVerifier } from "./plugins/auth.js";
import { redis, redisPrefix } from "./redis.js";
import { createAi } from "./services/ai.js";
import { memoryCache, redisCache } from "./services/cache.js";
import { localStorage } from "./services/storage.js";

const { db, pool } = createDb(env.DATABASE_URL);
const storage = localStorage(env.UPLOAD_DIR);
const cache = redis ? redisCache(redis, redisPrefix) : memoryCache();

const app = await buildApp({
  db,
  redis,
  storage,
  verifyToken: neonAuthVerifier(env.NEON_AUTH_JWKS_URL, env.NEON_AUTH_BASE_URL),
  webOrigin: env.WEB_ORIGIN,
  payLinkBase: env.PAY_LINK_BASE_URL,
  logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
  ai: (log) =>
    createAi(
      {
        mock: env.AI_MOCK,
        cacheTtlSeconds: env.AI_CACHE_TTL_SECONDS,
        sarvam: env.SARVAM_API_KEY
          ? {
              apiKey: env.SARVAM_API_KEY,
              sttModel: env.SARVAM_STT_MODEL,
              sttMode: env.SARVAM_STT_MODE,
              ttsModel: env.SARVAM_TTS_MODEL,
              ttsVoice: env.SARVAM_TTS_VOICE,
            }
          : undefined,
        groq: env.GROQ_API_KEY ? { apiKey: env.GROQ_API_KEY, model: env.GROQ_TEXT_MODEL } : undefined,
      },
      { cache, storage, log },
    ),
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
