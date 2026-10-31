// Loads the repo-root .env.local (written by `neon deploy`) into process.env,
// then runs the Next.js CLI with the same arguments. Build workers inherit
// process.env; `node --env-file` can't be used because Next forwards exec
// flags to workers via NODE_OPTIONS, where --env-file is rejected.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../../../.env.local", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

await import("next/dist/bin/next");
