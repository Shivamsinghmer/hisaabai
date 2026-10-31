// Sarvam AI: speech-to-text (Saaras) and text-to-speech (Bulbul).
// https://docs.sarvam.ai — REST, `api-subscription-key` header.
import { aiCall, AiError, type AiCallContext, isRetryableStatus } from "./aiCall.js";
import { cacheKey } from "./cache.js";
import type { FileStorage } from "./storage.js";
import type { SpeechService, SttResult } from "./types.js";

const BASE_URL = "https://api.sarvam.ai";

// Bulbul v4 Flash voices cover these; anything else (and Hinglish) is spoken as hi-IN.
const TTS_LANGUAGES = new Set([
  "hi-IN",
  "en-IN",
  "bn-IN",
  "gu-IN",
  "kn-IN",
  "mr-IN",
  "pa-IN",
  "ta-IN",
  "te-IN",
]);
export const ttsLanguage = (lang: string) => (TTS_LANGUAGES.has(lang) ? lang : "hi-IN");

type SarvamConfig = {
  apiKey: string;
  sttModel: string;
  sttMode: string;
  ttsModel: string;
  ttsVoice: string;
};

async function sarvamError(res: Response, op: string): Promise<AiError> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message) message = body.error.message;
  } catch {
    // keep the status message
  }
  return new AiError("sarvam", op, message, res.status, isRetryableStatus(res.status));
}

const extensionFor = (mimeType: string) =>
  mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("mp4")
        ? "m4a"
        : mimeType.includes("wav")
          ? "wav"
          : "audio";

export function createSarvam(cfg: SarvamConfig, ctx: AiCallContext, storage: FileStorage): SpeechService {
  const headers = { "api-subscription-key": cfg.apiKey };

  return {
    async stt(audio, opts) {
      const keyterms = opts.keyterms?.slice(0, 50) ?? [];
      const { value } = await aiCall<SttResult>(
        ctx,
        {
          provider: "sarvam",
          op: "stt",
          key: cacheKey(
            "sarvam.stt",
            cfg.sttModel,
            cfg.sttMode,
            opts.langHint ?? "",
            keyterms.join("|"),
            audio,
          ),
        },
        async (signal) => {
          const form = new FormData();
          // Codec is detected from the content; strip parameters like ";codecs=opus".
          const type = opts.mimeType.split(";")[0]!;
          form.append("file", new Blob([new Uint8Array(audio)], { type }), `speech.${extensionFor(type)}`);
          form.append("model", cfg.sttModel);
          form.append("mode", cfg.sttMode);
          if (opts.langHint) form.append("language_code", opts.langHint);
          if (keyterms.length) form.append("keyterms", JSON.stringify(keyterms));
          const res = await fetch(`${BASE_URL}/speech-to-text`, {
            method: "POST",
            headers,
            body: form,
            signal,
          });
          if (!res.ok) throw await sarvamError(res, "stt");
          const body = (await res.json()) as { transcript?: string; language_code?: string | null };
          return {
            value: { transcript: (body.transcript ?? "").trim(), languageCode: body.language_code ?? null },
          };
        },
      );
      return value;
    },

    async tts(text, opts) {
      const voice = opts.voice ?? cfg.ttsVoice;
      const lang = ttsLanguage(opts.lang);
      // The file itself is the cache: same text + voice + model → same URL.
      const name = `${cacheKey("sarvam.tts", cfg.ttsModel, voice, lang, text).slice(0, 40)}.mp3`;
      const audioUrl = `/media/tts/${name}`;
      if (await storage.exists("tts", name)) {
        ctx.log.info({ provider: "sarvam", op: "tts", cached: true }, "ai call");
        return { audioUrl };
      }
      const { value } = await aiCall<string>(ctx, { provider: "sarvam", op: "tts" }, async (signal) => {
        const res = await fetch(`${BASE_URL}/text-to-speech`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            text,
            target_language_code: lang,
            model: cfg.ttsModel,
            speaker: voice,
            output_audio_codec: "mp3",
          }),
          signal,
        });
        if (!res.ok) throw await sarvamError(res, "tts");
        const body = (await res.json()) as { audios?: string[] };
        const audio = body.audios?.[0];
        if (!audio) throw new AiError("sarvam", "tts", "no audio in response");
        return { value: audio };
      });
      await storage.put("tts", name, Buffer.from(value, "base64"));
      return { audioUrl };
    },
  };
}
