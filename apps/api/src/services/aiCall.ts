// Every AI call goes through here (§12): timeout, one retry, cache, and a log
// line with latency/tokens but never the transcript or other personal data.
import type { FastifyBaseLogger } from "fastify";
import type { AiCache } from "./cache.js";

export class AiError extends Error {
  constructor(
    readonly provider: string,
    readonly op: string,
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(`${provider}.${op}: ${message}`);
  }
}

export type AiCallContext = {
  cache: AiCache;
  ttlSeconds: number;
  log: Pick<FastifyBaseLogger, "info" | "warn">;
  timeoutMs?: number;
  /** Pause before the single retry; tests pass 0. */
  retryDelayMs?: () => number;
};

type CallOptions<T> = {
  provider: string;
  op: string;
  /** Omit to skip caching (e.g. calls with side effects). */
  key?: string;
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
};

export type CallResult<T> = { value: T; cached: boolean; tokens?: number };

const defaultDelay = () => 300 + Math.floor(Math.random() * 500);

/** HTTP status → whether one retry makes sense. */
export function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export async function aiCall<T>(
  ctx: AiCallContext,
  opts: CallOptions<T>,
  fn: (signal: AbortSignal) => Promise<{ value: T; tokens?: number }>,
): Promise<CallResult<T>> {
  const serialize = opts.serialize ?? JSON.stringify;
  const deserialize = opts.deserialize ?? ((raw: string) => JSON.parse(raw) as T);
  const started = Date.now();

  if (opts.key) {
    const hit = await ctx.cache.get(opts.key);
    if (hit !== null) {
      ctx.log.info(
        { provider: opts.provider, op: opts.op, ms: Date.now() - started, cached: true },
        "ai call",
      );
      return { value: deserialize(hit), cached: true };
    }
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await fn(AbortSignal.timeout(ctx.timeoutMs ?? 10_000));
      ctx.log.info(
        {
          provider: opts.provider,
          op: opts.op,
          ms: Date.now() - started,
          cached: false,
          attempt,
          tokens: result.tokens,
        },
        "ai call",
      );
      if (opts.key) await ctx.cache.set(opts.key, serialize(result.value), ctx.ttlSeconds);
      return { value: result.value, cached: false, tokens: result.tokens };
    } catch (err) {
      lastError = err;
      const retryable =
        (err instanceof AiError && err.retryable) ||
        (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) ||
        err instanceof TypeError; // fetch network failure
      ctx.log.warn(
        { provider: opts.provider, op: opts.op, attempt, retryable, err: (err as Error).message },
        "ai call failed",
      );
      if (!retryable || attempt === 2) break;
      await new Promise((r) => setTimeout(r, (ctx.retryDelayMs ?? defaultDelay)()));
    }
  }
  if (lastError instanceof AiError) throw lastError;
  throw new AiError(opts.provider, opts.op, (lastError as Error)?.message ?? "failed", undefined, true);
}
