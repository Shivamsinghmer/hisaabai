import { IntentResultSchema } from "@hisaab/shared";
import { describe, expect, it, vi } from "vitest";
import { classifyIntent } from "../src/agents/intentRouter.js";
import { loadPrompt, renderPrompt } from "../src/prompts/loader.js";
import { aiCall, AiError } from "../src/services/aiCall.js";
import { memoryCache } from "../src/services/cache.js";
import type { LlmService } from "../src/services/types.js";

const log = { info: vi.fn(), warn: vi.fn() };
const ctx = () => ({ cache: memoryCache(), ttlSeconds: 60, log, retryDelayMs: () => 0 });

describe("aiCall", () => {
  it("caches by key", async () => {
    const c = ctx();
    const fn = vi.fn(async () => ({ value: { n: 1 } }));
    expect((await aiCall(c, { provider: "p", op: "o", key: "k" }, fn)).cached).toBe(false);
    const second = await aiCall(c, { provider: "p", op: "o", key: "k" }, fn);
    expect(second).toEqual({ value: { n: 1 }, cached: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries once on a retryable error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new AiError("p", "o", "busy", 503, true))
      .mockResolvedValueOnce({ value: "ok" });
    expect((await aiCall(ctx(), { provider: "p", op: "o" }, fn)).value).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    const fn = vi.fn().mockRejectedValue(new AiError("p", "o", "bad", 400, false));
    await expect(aiCall(ctx(), { provider: "p", op: "o" }, fn)).rejects.toThrow("bad");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("times out and gives up after the retry", async () => {
    const fn = vi.fn(
      (signal: AbortSignal) =>
        new Promise<{ value: string }>((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason)),
        ),
    );
    await expect(aiCall({ ...ctx(), timeoutMs: 20 }, { provider: "p", op: "o" }, fn)).rejects.toBeInstanceOf(
      AiError,
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("never logs the payload", async () => {
    log.info.mockClear();
    await aiCall(ctx(), { provider: "p", op: "o" }, async () => ({ value: "Gupta ji 9876543210" }));
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("Gupta");
  });
});

describe("prompts", () => {
  it("intent_router has a version and renders without placeholders", () => {
    expect(loadPrompt("intent_router").version).toBeGreaterThanOrEqual(1);
    expect(renderPrompt("intent_router").text).toContain('"intent"');
  });
});

describe("classifyIntent", () => {
  it("skips the LLM for an empty transcript", async () => {
    const llm: LlmService = { chatJson: vi.fn() };
    expect(await classifyIntent(llm, "  ", log)).toMatchObject({ intent: "other", confidence: 0 });
    expect(llm.chatJson).not.toHaveBeenCalled();
  });

  it("falls back to keyword rules when the LLM fails", async () => {
    const llm: LlmService = { chatJson: vi.fn().mockRejectedValue(new Error("down")) };
    expect(await classifyIntent(llm, "Sharma ji ne 300 jama kiye", log)).toMatchObject({
      intent: "payment",
      fallback: true,
    });
  });

  it("passes the prompt and schema to the LLM", async () => {
    const chatJson = vi.fn().mockResolvedValue({ intent: "credit", confidence: 0.9 });
    await classifyIntent({ chatJson }, "loan chahiye", log);
    expect(chatJson).toHaveBeenCalledWith(
      expect.objectContaining({ op: "intent_router", user: "loan chahiye", schema: IntentResultSchema }),
    );
  });
});
