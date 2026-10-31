// Integration tests run against the Neon `test` branch only. Locally the
// connection comes from .env.test.local (`neon env pull --branch test --file
// .env.test.local`); in CI from repo secrets.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../../../.env.test.local", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

if (process.env.NEON_BRANCH !== "test") {
  throw new Error(
    `Refusing to run integration tests against NEON_BRANCH=${process.env.NEON_BRANCH ?? "(unset)"}; expected "test".`,
  );
}
