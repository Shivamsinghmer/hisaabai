import type { FastifyBaseLogger } from "fastify";
import type { AiCache } from "./cache.js";
import { createGroq } from "./groq.js";
import { mockLlm, mockSpeech } from "./mock.js";
import { createSarvam } from "./sarvam.js";
import type { FileStorage } from "./storage.js";
import type { AiServices } from "./types.js";

export type AiConfig = {
  mock: boolean;
  cacheTtlSeconds: number;
  sarvam?: { apiKey: string; sttModel: string; sttMode: string; ttsModel: string; ttsVoice: string };
  groq?: { apiKey: string; model: string };
};

export function createAi(
  cfg: AiConfig,
  deps: { cache: AiCache; storage: FileStorage; log: FastifyBaseLogger },
): AiServices {
  if (cfg.mock || !cfg.sarvam || !cfg.groq) {
    return { speech: mockSpeech(deps.storage), llm: mockLlm(), mock: true };
  }
  const ctx = { cache: deps.cache, ttlSeconds: cfg.cacheTtlSeconds, log: deps.log };
  return {
    speech: createSarvam(cfg.sarvam, ctx, deps.storage),
    llm: createGroq(cfg.groq, ctx),
    mock: false,
  };
}
