// Copies src/prompts/*.md to dist/prompts/ after `tsc` (tsc only emits .js).
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";

const from = new URL("../src/prompts/", import.meta.url);
const to = new URL("../dist/prompts/", import.meta.url);
mkdirSync(to, { recursive: true });
const files = readdirSync(from).filter((f) => f.endsWith(".md"));
for (const f of files) copyFileSync(new URL(f, from), new URL(f, to));
console.log(`copied ${files.length} prompt(s)`);
