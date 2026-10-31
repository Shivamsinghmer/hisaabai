// Groq (OpenAI-compatible chat completions) for classification, extraction and
// agents. JSON mode + zod validation, with one repair round if the JSON is off.
import { aiCall, AiError, type AiCallContext, isRetryableStatus } from "./aiCall.js";
import { cacheKey } from "./cache.js";
import type { LlmService } from "./types.js";

const URL_CHAT = "https://api.groq.com/openai/v1/chat/completions";

type Message = { role: "system" | "user" | "assistant"; content: string };
type GroqConfig = { apiKey: string; model: string };

export function createGroq(cfg: GroqConfig, ctx: AiCallContext): LlmService {
  async function complete(op: string, messages: Message[], signal: AbortSignal) {
    const res = await fetch(URL_CHAT, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0,
        response_format: { type: "json_object" },
        // gpt-oss models reason before answering; keep it short for latency.
        reasoning_effort: "low",
      }),
      signal,
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        // keep the status message
      }
      throw new AiError("groq", op, message, res.status, isRetryableStatus(res.status));
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    return { content: body.choices?.[0]?.message?.content ?? "", tokens: body.usage?.total_tokens };
  }

  return {
    async chatJson({ op, system, user, schema }) {
      const { value } = await aiCall(
        ctx,
        { provider: "groq", op, key: cacheKey("groq", cfg.model, op, system, user) },
        async (signal) => {
          const messages: Message[] = [
            { role: "system", content: system },
            { role: "user", content: user },
          ];
          const first = await complete(op, messages, signal);
          const parsed = parseJson(first.content, schema);
          if (parsed.ok) return { value: parsed.value, tokens: first.tokens };

          // One repair round: show the model its own reply and what was wrong.
          const second = await complete(
            op,
            [
              ...messages,
              { role: "assistant", content: first.content },
              {
                role: "user",
                content: `That reply was invalid (${parsed.error}). Reply with valid JSON only.`,
              },
            ],
            signal,
          );
          const repaired = parseJson(second.content, schema);
          if (!repaired.ok) throw new AiError("groq", op, `invalid JSON after repair: ${repaired.error}`);
          return { value: repaired.value, tokens: (first.tokens ?? 0) + (second.tokens ?? 0) };
        },
      );
      return value;
    },
  };
}

function parseJson<T>(
  content: string,
  schema: {
    safeParse(v: unknown): { success: true; data: T } | { success: false; error: { message: string } };
  },
): { ok: true; value: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return { ok: false, error: "not JSON" };
  }
  const result = schema.safeParse(json);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error.message.slice(0, 300) };
}
