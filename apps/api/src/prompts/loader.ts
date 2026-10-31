// Prompts live in src/prompts/*.md (§19), each with a version header:
//   ---
//   version: 1
//   ---
//   …text with {{placeholders}}…
// The build copies them next to dist/prompts/loader.js.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Prompt = { name: string; version: number; text: string };

const cache = new Map<string, Prompt>();

export function loadPrompt(name: string): Prompt {
  const hit = cache.get(name);
  if (hit) return hit;
  const raw = readFileSync(fileURLToPath(new URL(`./${name}.md`, import.meta.url)), "utf8").replace(
    /\r\n/g,
    "\n",
  );
  const match = raw.match(/^---\nversion:\s*(\d+)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`prompt ${name}.md must start with a "version: N" header`);
  const prompt = { name, version: Number(match[1]), text: match[2]!.trim() };
  cache.set(name, prompt);
  return prompt;
}

/** Fills {{placeholders}}; throws if one is missing so a prompt never ships half-filled. */
export function renderPrompt(name: string, vars: Record<string, string> = {}): Prompt {
  const prompt = loadPrompt(name);
  const text = prompt.text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`prompt ${name}: missing {{${key}}}`);
    return value;
  });
  return { ...prompt, text };
}
