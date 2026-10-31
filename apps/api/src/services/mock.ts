// AI_MOCK=true: deterministic, offline stand-ins for Sarvam and Groq. Used by
// tests and as the last-resort demo fallback (BUILD_PLAN "AI_MOCK mode").
import {
  parseAmountRupees,
  type CallIntent,
  type ExtractedEntry,
  type Intent,
  type IntentResult,
  type ScoreFactor,
} from "@hisaab/shared";
import { basicScoreReply } from "../credit/score.js";
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

const HINDI_NUM = /\b(\d{1,2}|gyarah|barah|terah|chaudah|pandrah|das|nau|aath|saat|chhe|che|paanc[hz]h?|cha[a]?r|teen|do|ek)\s*mahine?\b/i;
const HINDI_NUM_VALUE: Record<string, number> = {
  gyarah: 11,
  barah: 12,
  terah: 13,
  chaudah: 14,
  pandrah: 15,
  das: 10,
  nau: 9,
  aath: 8,
  saat: 7,
  chhe: 6,
  che: 6,
  paanch: 5,
  paanc: 5,
  chaar: 4,
  char: 4,
  teen: 3,
  do: 2,
  ek: 1,
};

/** Rule-based stand-ins for teach_back_judge.md and score_explainer.md. */
export function mockTeachBack(user: string): { emi_rupees: number | null; tenure_months: number | null } {
  const emi = parseAmountRupees(user);
  const m = user.match(HINDI_NUM)?.[1];
  return { emi_rupees: emi, tenure_months: m ? (HINDI_NUM_VALUE[m] ?? Number(m)) : null };
}

export function mockScoreExplainer(user: string): { replyText: string } {
  const data = JSON.parse(user) as {
    score: number;
    change: number | null;
    factors: ScoreFactor[];
    tips: string[];
  };
  return { replyText: basicScoreReply(data.score, data.change, data.factors, data.tips) };
}

export function mockLlm(): LlmService {
  return {
    async chatJson({ op, user, schema }) {
      if (op === "intent_router") return schema.parse(mockIntent(user));
      if (op === "extract_entry") return schema.parse(mockExtract(user));
      if (op === "call_agent") return schema.parse(mockCallIntent(user));
      if (op === "score_explainer") return schema.parse(mockScoreExplainer(user));
      if (op === "teach_back") return schema.parse(mockTeachBack(user));
      throw new Error(`mock LLM has no fixture for op "${op}"`);
    },
  };
}

const DATE_WORDS =
  /\b(aaj|kal|parso|parson|monday|tuesday|wednesday|thursday|friday|saturday|sunday|somvar|mangalvar|budhvar|guruvar|shukravar|shanivar|ravivar|agle hafte|\d{1,2} tareekh)\b/i;

/** Rule-based stand-in for call_agent.md. */
export function mockCallIntent(text: string): CallIntent {
  const lower = text.toLowerCase();
  const date = lower.match(DATE_WORDS)?.[1] ?? null;
  const amount = parseAmountRupees(text);
  const base = { promised_date_phrase: date, amount_rupees: null };
  if (/(de diya tha|de chuka|pehle hi|galat hai|itna nahi)/.test(lower))
    return { ...base, intent: "dispute" };
  if (/(galat number|wrong number|main nahi hoon)/.test(lower)) return { ...base, intent: "wrong_person" };
  if (/(busy|baad mein (call|baat))/.test(lower)) return { ...base, intent: "busy" };
  if (/(nahi dunga|nahi doonga|nahi de sakta)/.test(lower)) return { ...base, intent: "refuse" };
  if (amount !== null && /(abhi|baaki)/.test(lower))
    return { ...base, intent: "partial", amount_rupees: amount };
  if (date) return { ...base, intent: "promise" };
  if (/(abhi|link|bhejo|kar raha)/.test(lower)) return { ...base, intent: "pay_now" };
  return { ...base, intent: "unclear" };
}
