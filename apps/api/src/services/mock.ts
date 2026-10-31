// AI_MOCK=true: deterministic, offline stand-ins for Sarvam and Groq. Used by
// tests and as the last-resort demo fallback (BUILD_PLAN "AI_MOCK mode").
import { parseAmountRupees, type ExtractedEntry, type Intent, type IntentResult } from "@hisaab/shared";
import { cacheKey } from "./cache.js";
import type { FileStorage } from "./storage.js";
import type { LlmService, SpeechService } from "./types.js";

export const MOCK_TRANSCRIPT = "Gupta ji, do kilo chawal, 120 udhaar";

/** Keyword rules good enough for the demo phrases; the real router is an LLM. */
const RULES: [Intent, RegExp][] = [
  ["credit", /\b(loan|lone|score|emi|byaaj|karz|karza|qarz)\b/i],
  ["settings", /\b(bhasha|language|setting|settings|awaaz|voice|band karo|chalu karo)\b/i],
  ["payment", /\b(jama|de diye|de diya|wapas|chuka|chukaya|bhar diya|payment)\b/i],
  ["collect", /\b(yaad|remind|reminder|call|phone|vasool|wasool|tagaada|tagada)\b/i],
  ["stock", /\b(stock|khatam|order|maal|supplier)\b/i],
  ["ask", /\b(kitni|kitna|kaunsa|kiska|sabse|kamaya|bikri)\b|\bsale\b/i],
  ["capture", /\b(udhaar|udhar|likho|likh do|naam|naya customer|hata do|entry|kilo|packet)\b|\d/i],
];

export function mockIntent(text: string): IntentResult {
  if (!text.trim()) return { intent: "other", confidence: 0.2 };
  for (const [intent, re] of RULES) if (re.test(text)) return { intent, confidence: 0.9 };
  return { intent: "other", confidence: 0.5 };
}

const HONORIFIC_NAME = /\b([a-z]+ (?:ji|jee|didi|di|sahab|saab|bhaiya|bhai|aunty|bhabhi))\b/i;

/** Rule-based stand-in for extract_entry.md (tests, and fallback when Groq is down). */
export function mockExtract(text: string): ExtractedEntry {
  const lower = text.toLowerCase();
  const kind = /\b(hata|cancel|galat)\b/.test(lower)
    ? "delete_last"
    : /\b(jama|de diye|de diya|wapas|chuka|chukaya)\b/.test(lower)
      ? "payment"
      : /\b(udhaar|udhar|likho|likh do|naam)\b|\d|\bsau\b/.test(lower)
        ? "credit"
        : "unknown";
  const name =
    text.match(HONORIFIC_NAME)?.[1] ??
    text
      .replace(/^naya customer\s+/i, "")
      .split(/,| ne\b| ka\b| ki\b| ke\b/i)[0]
      ?.trim() ??
    null;
  return {
    kind,
    customer_name: name || null,
    is_new_customer: /\b(naya|nayi) (customer|grahak)\b/.test(lower),
    amount_rupees: parseAmountRupees(text),
    items: text.match(/\b(\w+ (?:kilo|kg|packet|litre) \w+)\b/i)?.[1] ?? null,
    due_phrase: text.match(/\b(\w+ tak|\d+ din mein)\b/i)?.[1] ?? null,
    confidence: 0.8,
  };
}

/** 0.3 s of 8 kHz mono silence, so the client's audio player has something real to play. */
function silentWav(): Buffer {
  const samples = 2400;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(16000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  return buf;
}

export function mockSpeech(storage: FileStorage): SpeechService {
  return {
    async stt(audio) {
      // Tiny uploads stand in for "nothing heard" so tests can cover §17.
      if (audio.length < 1024) return { transcript: "", languageCode: null };
      return { transcript: MOCK_TRANSCRIPT, languageCode: "hi-IN" };
    },
    async tts(text, opts) {
      const name = `mock-${cacheKey("mock.tts", opts.lang, text).slice(0, 32)}.wav`;
      if (!(await storage.exists("tts", name))) await storage.put("tts", name, silentWav());
      return { audioUrl: `/media/tts/${name}` };
    },
  };
}

export function mockLlm(): LlmService {
  return {
    async chatJson({ op, user, schema }) {
      if (op === "intent_router") return schema.parse(mockIntent(user));
      if (op === "extract_entry") return schema.parse(mockExtract(user));
      throw new Error(`mock LLM has no fixture for op "${op}"`);
    },
  };
}
