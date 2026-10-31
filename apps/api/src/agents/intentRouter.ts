// intentRouter (§12): one LLM classification per utterance → feature handler.
import { IntentResultSchema, type IntentResult } from "@hisaab/shared";
import type { FastifyBaseLogger } from "fastify";
import { renderPrompt } from "../prompts/loader.js";
import { mockIntent } from "../services/mock.js";
import type { LlmService } from "../services/types.js";

export async function classifyIntent(
  llm: LlmService,
  transcript: string,
  log: Pick<FastifyBaseLogger, "warn">,
): Promise<IntentResult & { fallback: boolean }> {
  if (!transcript.trim()) return { intent: "other", confidence: 0, fallback: false };
  try {
    const prompt = renderPrompt("intent_router");
    const result = await llm.chatJson({
      op: "intent_router",
      system: prompt.text,
      user: transcript,
      schema: IntentResultSchema,
    });
    return { ...result, fallback: false };
  } catch (err) {
    // §17: provider down → keep working with the keyword rules.
    log.warn({ err: (err as Error).message }, "intent router fell back to keyword rules");
    return { ...mockIntent(transcript), fallback: true };
  }
}
