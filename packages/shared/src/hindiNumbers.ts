// Deterministic rupee-amount parser for Hinglish speech/text. The LLM extracts
// entries; this cross-checks the amount (BUILD_PLAN "deterministic code checks
// the LLM"). Handles digits ("450/-", "₹1,200"), Hindi number words
// ("ek sau bees" = 120), fractions ("dedh sau" = 150, "saade teen sau" = 350)
// and skips quantities ("do kilo chawal").

const WORDS: Record<number, string[]> = {
  1: ["ek", "ik"],
  2: ["do", "doh"],
  3: ["teen", "tin"],
  4: ["char", "chaar"],
  5: ["paanch", "panch", "panj"],
  6: ["chhe", "chhah", "chah", "che", "chhey", "chhai"],
  7: ["saat", "sat"],
  8: ["aath", "aat"],
  9: ["nau"],
  10: ["das", "dus"],
  11: ["gyarah", "gyaarah", "gyara", "gyaara"],
  12: ["barah", "baarah", "bara", "baara"],
  13: ["terah", "tera"],
  14: ["chaudah", "chauda", "chouda"],
  15: ["pandrah", "pandra", "pandrah"],
  16: ["solah", "sola"],
  17: ["satrah", "satra"],
  18: ["atharah", "athara", "attharah"],
  19: ["unnis", "unees", "unnees"],
  20: ["bees", "bis"],
  21: ["ikkis", "ikkees"],
  22: ["bais", "baees", "baais"],
  23: ["teis", "teyis", "teees"],
  24: ["chaubis", "chaubees", "chobis"],
  25: ["pachis", "pachees", "pachchis", "pachchees"],
  26: ["chhabbis", "chhabbees", "chabbis", "chabbees"],
  27: ["sattais", "sattaees"],
  28: ["atthais", "atthaees", "athais"],
  29: ["untis", "untees", "unattis", "unatis"],
  30: ["tees", "tis"],
  31: ["iktis", "iktees", "ikattis", "ikattees"],
  32: ["battis", "battees"],
  33: ["taintis", "taintees", "tentees"],
  34: ["chautis", "chauntis", "chauntees", "chontis"],
  35: ["paintis", "paintees", "pentis"],
  36: ["chhattis", "chhattees", "chattis", "chattees"],
  37: ["saintis", "saintees"],
  38: ["adtis", "adtees", "artees", "artis"],
  39: ["untalis", "untaalees", "unchalis"],
  40: ["chalis", "chaalis", "chalees", "chaalees"],
  41: ["iktalis", "iktalees"],
  42: ["bayalis", "bayalees"],
  43: ["taintalis", "taintalees"],
  44: ["chavalis", "chawalis", "chauvalees"],
  45: ["paintalis", "paintalees"],
  46: ["chhiyalis", "chhiyalees"],
  47: ["saintalis", "saintalees"],
  48: ["adtalis", "adtalees", "artalees"],
  49: ["unchas", "unchaas"],
  50: ["pachas", "pachaas"],
  51: ["ikyavan", "ikyaavan"],
  52: ["bavan", "baavan"],
  53: ["tirpan", "tirepan"],
  54: ["chauvan", "chauwan"],
  55: ["pachpan"],
  56: ["chhappan", "chappan"],
  57: ["sattavan"],
  58: ["atthavan"],
  59: ["unsath", "unsaath"],
  60: ["saath"],
  61: ["iksath"],
  62: ["basath"],
  63: ["tirsath"],
  64: ["chausath"],
  65: ["painsath"],
  66: ["chhiyasath"],
  67: ["sarsath"],
  68: ["adsath"],
  69: ["unhattar"],
  70: ["sattar"],
  71: ["ikhattar"],
  72: ["bahattar"],
  73: ["tihattar"],
  74: ["chauhattar"],
  75: ["pachattar", "pachhattar"],
  76: ["chhihattar"],
  77: ["satattar", "sathattar"],
  78: ["athattar"],
  79: ["unasi", "unaasi"],
  80: ["assi", "assee"],
  81: ["ikyasi"],
  82: ["bayasi"],
  83: ["tirasi"],
  84: ["chaurasi"],
  85: ["pachasi"],
  86: ["chhiyasi"],
  87: ["satasi"],
  88: ["athasi"],
  89: ["navasi", "nawasi"],
  90: ["nabbe", "nabbey"],
  91: ["ikyanve"],
  92: ["banve"],
  93: ["tiranve"],
  94: ["chauranve"],
  95: ["pachanve"],
  96: ["chhiyanve"],
  97: ["sattanve"],
  98: ["atthanve"],
  99: ["ninyanve", "ninnyanve"],
};

const NUMBER_WORDS = new Map<string, number>(
  Object.entries(WORDS).flatMap(([n, words]) => words.map((w) => [w, Number(n)] as const)),
);

// dedh = 1½, dhai = 2½ (used alone or before a scale: "dedh sau" = 150).
const HALF_WORDS = new Map<string, number>([
  ["dedh", 1.5],
  ["derh", 1.5],
  ["dhai", 2.5],
  ["dhaai", 2.5],
  ["adhai", 2.5],
  ["dhaee", 2.5],
]);

// sawa X = X + ¼, saade X = X + ½, paune X = X − ¼ (of the following unit).
const FRACTION_PREFIX = new Map<string, number>([
  ["sawa", 0.25],
  ["savaa", 0.25],
  ["sava", 0.25],
  ["saade", 0.5],
  ["sade", 0.5],
  ["saadhe", 0.5],
  ["sadhe", 0.5],
  ["paune", -0.25],
  ["pone", -0.25],
]);

const SCALES = new Map<string, number>([
  ["sau", 100],
  ["hazaar", 1000],
  ["hazar", 1000],
  ["hajar", 1000],
  ["hajaar", 1000],
  ["lakh", 100_000],
  ["laakh", 100_000],
]);

const CURRENCY_BEFORE = new Set(["₹", "rs", "inr"]);
const CURRENCY_AFTER = new Set(["rupaye", "rupay", "rupaiya", "rupiya", "rupees", "rupee", "rs", "rupya"]);

/** Words that turn a preceding number into a quantity, not an amount. */
const UNITS = new Set([
  "kilo",
  "kg",
  "kilogram",
  "gram",
  "gm",
  "grams",
  "litre",
  "liter",
  "ltr",
  "packet",
  "packets",
  "pkt",
  "dozen",
  "darjan",
  "piece",
  "pieces",
  "pcs",
  "pc",
  "bori",
  "bag",
  "bottle",
  "botal",
  "box",
  "dibba",
  "pav",
  "paav",
]);

/** Single words that are usually not numbers ("hata do", "ek baat", "ke saath"). */
const AMBIGUOUS_ALONE = new Set(["ek", "ik", "do", "doh", "sat", "tin", "bis", "tis", "bara", "sola", "che"]);

type Token = { text: string; kind: "digit" | "word" | "currency" };

function tokenize(input: string): Token[] {
  const normalized = input.toLowerCase().replace(/\/-/g, " ");
  const re = /₹|\d[\d,]*(?:\.\d+)?|[a-z]+/g;
  const tokens: Token[] = [];
  for (const match of normalized.matchAll(re)) {
    const text = match[0];
    tokens.push({ text, kind: text === "₹" ? "currency" : /^\d/.test(text) ? "digit" : "word" });
  }
  return tokens;
}

function isNumberWord(word: string): boolean {
  return NUMBER_WORDS.has(word) || HALF_WORDS.has(word) || FRACTION_PREFIX.has(word) || SCALES.has(word);
}

/** Value of a run of Hindi number words, e.g. ["ek","sau","bees"] → 120. Null if invalid. */
export function parseHindiNumberWords(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let fraction: number | null = null;
  let sawNumber = false;

  for (const word of words) {
    const prefix = FRACTION_PREFIX.get(word);
    if (prefix !== undefined) {
      fraction = prefix;
      continue;
    }
    const half = HALF_WORDS.get(word);
    const base = NUMBER_WORDS.get(word);
    if (half !== undefined || base !== undefined) {
      let n = half ?? base!;
      if (fraction !== null) {
        n += fraction;
        fraction = null;
      }
      current += n;
      sawNumber = true;
      continue;
    }
    const scale = SCALES.get(word);
    if (scale !== undefined) {
      // "sawa sau" = 125: a fraction directly before a scale applies to 1.
      let multiplier = current === 0 ? 1 : current;
      if (fraction !== null) {
        multiplier = (current === 0 ? 1 : current) + fraction;
        fraction = null;
      }
      if (scale === 100) {
        current = multiplier * 100;
      } else {
        total += multiplier * scale;
        current = 0;
      }
      sawNumber = true;
      continue;
    }
    return null;
  }
  if (!sawNumber) return null;
  return Math.round((total + current) * 100) / 100;
}

type Candidate = { value: number; start: number; end: number; words: string[]; digit: boolean };

/**
 * Finds the rupee amount in a Hinglish utterance. Prefers amounts marked as
 * money (₹, rs, rupaye), skips quantities ("do kilo") and lone ambiguous words
 * ("hata do"). Returns rupees (may be fractional) or null.
 */
export function parseAmountRupees(input: string): number | null {
  const tokens = tokenize(input);
  const candidates: Candidate[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind === "digit") {
      const value = Number(token.text.replace(/,/g, ""));
      if (Number.isFinite(value)) candidates.push({ value, start: i, end: i, words: [], digit: true });
      continue;
    }
    if (token.kind !== "word" || !isNumberWord(token.text)) continue;
    // "ke saath" means "with", not 60.
    if (token.text === "saath" && tokens[i - 1]?.text === "ke") continue;

    const words: string[] = [];
    let j = i;
    while (j < tokens.length && tokens[j]!.kind === "word" && isNumberWord(tokens[j]!.text)) {
      words.push(tokens[j]!.text);
      j++;
    }
    const value = parseHindiNumberWords(words);
    if (value !== null) candidates.push({ value, start: i, end: j - 1, words, digit: false });
    i = j - 1;
  }

  const isMoney = (c: Candidate) =>
    CURRENCY_BEFORE.has(tokens[c.start - 1]?.text ?? "") || CURRENCY_AFTER.has(tokens[c.end + 1]?.text ?? "");
  const isQuantity = (c: Candidate) => UNITS.has(tokens[c.end + 1]?.text ?? "");
  const isAmbiguous = (c: Candidate) => !c.digit && c.words.length === 1 && AMBIGUOUS_ALONE.has(c.words[0]!);

  const usable = candidates.filter((c) => !isQuantity(c));
  const money = usable.find(isMoney);
  if (money) return money.value;
  return usable.find((c) => !isAmbiguous(c))?.value ?? null;
}
