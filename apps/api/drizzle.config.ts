import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// DRIZZLE_ENV=test targets the Neon `test` branch (.env.test.local); default is
// the branch in .env.local (normally `dev`).
// drizzle-kit runs from apps/api (package scripts); import.meta.dirname is
// unavailable in its config loader.
const envFile = resolve(
  process.cwd(),
  "../..",
  process.env.DRIZZLE_ENV === "test" ? ".env.test.local" : ".env.local",
);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error(`DATABASE_URL_UNPOOLED missing (looked in ${envFile})`);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  // Migrations need a direct (non-pooled) connection.
  dbCredentials: { url },
  // Never touch Neon-managed schemas such as neon_auth.
  schemaFilter: ["public"],
  strict: true,
});
