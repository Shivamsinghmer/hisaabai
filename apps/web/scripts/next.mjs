// Loads the repo-root .env.local (written by `neon deploy`) into process.env,
// then runs the Next.js CLI with the same arguments. Build workers inherit
// process.env; `node --env-file` can't be used because Next forwards exec
// flags to workers via NODE_OPTIONS, where --env-file is rejected.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../../../.env.local", import.meta.url));
if (existsSync(envFile)) {
  const hadNodeEnv = "NODE_ENV" in process.env;
  process.loadEnvFile(envFile);
  // Next sets NODE_ENV per command; a value from the file would make
  // `next build` render with development React and crash prerendering.
  if (!hadNodeEnv) delete process.env.NODE_ENV;
}

await import("next/dist/bin/next");
