import {
  TtsBodySchema,
  VoiceTextBodySchema,
  type VoiceCommandResponse,
  type VoiceConfirm,
} from "@hisaab/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { classifyIntent } from "../agents/intentRouter.js";
import { handleLedgerCommand } from "../capture/voiceEntry.js";
import type { Db } from "../db/client.js";
import { getMerchant } from "../db/repos/merchants.js";
import { customers } from "../db/schema.js";
import { AppError, parseBody } from "../lib/errors.js";
import type { AuthGuards } from "../plugins/auth.js";
import { AiError } from "../services/aiCall.js";
import { isSafeFileName, type FileStorage } from "../services/storage.js";
import type { AiServices } from "../services/types.js";
import { NOT_UNDERSTOOD, replyFor } from "../voice/handlers.js";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 30 s of webm/opus is ~200 KB
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|wave|aac|x-m4a)|^video\/webm/;

type Input = { text: string; languageCode: string | null; confirm?: VoiceConfirm };

export function voiceRoutes(
  app: FastifyInstance,
  { db, ai, storage, guards }: { db: Db; ai: AiServices; storage: FileStorage; guards: AuthGuards },
) {
  /** Customer names bias speech recognition toward this shop's khata (Saaras keyterms). */
  async function keytermsFor(merchantId: string): Promise<string[]> {
    const rows = await db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.merchantId, merchantId))
      .orderBy(desc(customers.createdAt))
      .limit(50);
    return rows.map((r) => r.name);
  }

  async function readInput(req: FastifyRequest, merchantId: string): Promise<Input> {
    if (!req.isMultipart()) {
      const body = parseBody(VoiceTextBodySchema, req.body);
      return { text: body.text, languageCode: null, confirm: body.confirm };
    }
    let audio: { data: Buffer; mimeType: string } | null = null;
    let langHint: string | undefined;
    for await (const part of req.parts()) {
      if (part.type === "file" && part.fieldname === "audio") {
        if (!AUDIO_TYPES.test(part.mimetype)) {
          throw new AppError(415, "UNSUPPORTED_AUDIO", `Audio type not supported: ${part.mimetype}`);
        }
        audio = { data: await part.toBuffer(), mimeType: part.mimetype };
      } else if (part.type === "field" && part.fieldname === "langHint" && typeof part.value === "string") {
        langHint = part.value || undefined;
      }
    }
    if (!audio) throw new AppError(400, "VALIDATION_ERROR", "audio: file is required");
    try {
      const stt = await ai.speech.stt(audio.data, {
        mimeType: audio.mimeType,
        langHint,
        keyterms: await keytermsFor(merchantId),
      });
      return { text: stt.transcript, languageCode: stt.languageCode };
    } catch (err) {
      if (err instanceof AiError && err.status !== undefined && err.status < 500 && err.status !== 429) {
        // Bad/empty/too-long audio: treat as "not understood" so the client shows the text box.
        req.log.warn({ err: err.message }, "stt rejected audio");
        return { text: "", languageCode: null };
      }
      throw new AppError(503, "AI_UNAVAILABLE", "Thodi der mein ho jayega, abhi likh kar bata dijiye.");
    }
  }

  async function speak(text: string, lang: string, req: FastifyRequest): Promise<string | null> {
    try {
      return (await ai.speech.tts(text, { lang })).audioUrl;
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, "tts failed; replying with text only");
      return null;
    }
  }

  // §8: mic audio (or typed text) → STT → intent → handler → reply text → TTS.
  app.post(
    "/voice/command",
    { preHandler: guards.requireMerchant },
    async (req): Promise<VoiceCommandResponse> => {
      const { merchantId, role } = req.membership!;
      const merchant = await getMerchant(db, merchantId);
      const input = await readInput(req, merchantId);

      if (!input.text) {
        return {
          understood: false,
          transcript: "",
          languageCode: input.languageCode,
          intent: null,
          confidence: null,
          replyText: NOT_UNDERSTOOD,
          replyAudioUrl: await speak(NOT_UNDERSTOOD, merchant!.language, req),
          entry: null,
          followUp: null,
        };
      }

      // A follow-up answer ("Haan, banao") goes straight back to the ledger.
      const routed = input.confirm
        ? { intent: "capture" as const, confidence: 1, fallback: false }
        : await classifyIntent(ai.llm, input.text, req.log);
      req.log.info(
        { intent: routed.intent, confidence: routed.confidence, fallback: routed.fallback },
        "voice command",
      );

      let replyText = replyFor(routed.intent, input.text, role);
      let entry: VoiceCommandResponse["entry"] = null;
      let followUp: VoiceCommandResponse["followUp"] = null;
      if (routed.intent === "capture" || routed.intent === "payment") {
        const result = await handleLedgerCommand({
          db,
          llm: ai.llm,
          log: req.log,
          merchant: merchant!,
          membership: req.membership!,
          transcript: input.text,
          confirm: input.confirm,
        });
        ({ replyText, entry, followUp } = result);
      }

      return {
        understood: routed.intent !== "other",
        transcript: input.text,
        languageCode: input.languageCode,
        intent: routed.intent,
        confidence: routed.confidence,
        replyText,
        replyAudioUrl: await speak(replyText, merchant!.language, req),
        entry,
        followUp,
      };
    },
  );

  app.post("/voice/tts", { preHandler: guards.requireMerchant }, async (req) => {
    const body = parseBody(TtsBodySchema, req.body);
    const merchant = await getMerchant(db, req.membership!.merchantId);
    try {
      return await ai.speech.tts(body.text, { lang: body.lang ?? merchant!.language, voice: body.voice });
    } catch {
      throw new AppError(503, "AI_UNAVAILABLE", "Awaaz abhi nahi ban paayi, thodi der mein koshish karein.");
    }
  });

  // Generated audio. Names are unguessable content hashes, so no auth (the
  // <audio> element can't send a bearer token).
  app.get<{ Params: { name: string } }>("/media/tts/:name", async (req, reply) => {
    const { name } = req.params;
    if (!isSafeFileName(name)) throw new AppError(404, "NOT_FOUND", "Not found");
    const data = await storage.get("tts", name);
    if (!data) throw new AppError(404, "NOT_FOUND", "Not found");
    return reply
      .header("content-type", name.endsWith(".wav") ? "audio/wav" : "audio/mpeg")
      .header("cache-control", "public, max-age=31536000, immutable")
      .send(data);
  });
}

export const voiceLimits = { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 5 };
