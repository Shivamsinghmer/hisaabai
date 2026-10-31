// Fuzzy customer matching for voice/photo entries: "Gupta jee" → "Gupta ji",
// "Suresh Gupta" → "Gupta ji" (alias), "Khan saab" → "Khan sahab".

const HONORIFICS = new Set([
  "ji",
  "didi",
  "di",
  "bhaiya",
  "bhai",
  "sahab",
  "aunty",
  "bhabhi",
  "uncle",
  "chacha",
  "madam",
]);

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bjee\b/g, "ji")
    .replace(/\b(saab|saheb|sahib|sahb)\b/g, "sahab")
    .replace(/\b(anti|auntie|aunti)\b/g, "aunty")
    .replace(/\s+/g, " ")
    .trim();
}

/** The name without honorifics: "gupta ji" → "gupta". */
const core = (normalized: string) =>
  normalized
    .split(" ")
    .filter((w) => !HONORIFICS.has(w))
    .join(" ");

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

const similarity = (a: string, b: string) =>
  a && b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0;

export type Candidate = { id: string; name: string; aliases: string[] | null };
export type MatchResult<C> =
  { kind: "match"; customer: C; score: number } | { kind: "ambiguous"; options: C[] } | { kind: "none" };

const MATCH = 0.8;
const MARGIN = 0.08;

export function scoreName(spoken: string, candidate: Candidate): number {
  const s = normalizeName(spoken);
  let best = 0;
  for (const raw of [candidate.name, ...(candidate.aliases ?? [])]) {
    const c = normalizeName(raw);
    best = Math.max(best, similarity(s, c));
    // Same person, different honorific ("Gupta" vs "Gupta ji"): slightly lower.
    best = Math.max(best, similarity(core(s), core(c)) * 0.95);
    // "Gupta ji" could be "Ramesh Gupta": every spoken word appears in the name.
    const spokenWords = core(s).split(" ").filter(Boolean);
    const nameWords = new Set(core(c).split(" "));
    if (spokenWords.length && spokenWords.every((w) => nameWords.has(w))) best = Math.max(best, 0.85);
  }
  return best;
}

export function matchCustomer<C extends Candidate>(spoken: string, customers: C[]): MatchResult<C> {
  const ranked = customers
    .map((customer) => ({ customer, score: scoreName(spoken, customer) }))
    .filter((r) => r.score >= MATCH)
    .sort((a, b) => b.score - a.score);
  const [first, second] = ranked;
  if (!first) return { kind: "none" };
  if (second && first.score - second.score < MARGIN)
    return { kind: "ambiguous", options: [first.customer, second.customer] };
  return { kind: "match", customer: first.customer, score: first.score };
}
