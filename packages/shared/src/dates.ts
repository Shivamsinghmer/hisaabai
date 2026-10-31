// Relative and written dates in Hinglish → ISO date (YYYY-MM-DD) in IST.
// "kal"/"parso" mean both yesterday/tomorrow and day-before/after in Hindi, so
// callers say which way to read them: `future` for due dates and promises
// ("Friday tak", "kal dunga"), `past` for entry dates ("kal liya tha").

export const IST = "Asia/Kolkata";

export type DateDirection = "future" | "past";
export type IsoDate = string;

const istFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in India. */
export function todayIst(now: Date = new Date()): IsoDate {
  return istFormatter.format(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(date: IsoDate, months: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

function weekday(date: IsoDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const WEEKDAYS: Record<string, number> = {
  ravivar: 0,
  itwar: 0,
  sunday: 0,
  somvar: 1,
  somwar: 1,
  monday: 1,
  mangalvar: 2,
  mangalwar: 2,
  tuesday: 2,
  budhvar: 3,
  budhwar: 3,
  wednesday: 3,
  guruvar: 4,
  guruwar: 4,
  brihaspativar: 4,
  veervar: 4,
  thursday: 4,
  shukravar: 5,
  shukrawar: 5,
  friday: 5,
  shanivar: 6,
  shaniwar: 6,
  saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const SMALL_NUMBERS: Record<string, number> = {
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  pandrah: 15,
  bees: 20,
  tees: 30,
};

function isValidDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function iso(y: number, m: number, d: number): IsoDate {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A day/month with no year: pick the year that fits the direction. */
function withInferredYear(
  day: number,
  month: number,
  today: IsoDate,
  direction: DateDirection,
): IsoDate | null {
  const year = Number(today.slice(0, 4));
  for (const y of direction === "future" ? [year, year + 1] : [year, year - 1]) {
    if (!isValidDate(y, month, day)) continue;
    const candidate = iso(y, month, day);
    if (direction === "future" ? candidate >= today : candidate <= today) return candidate;
  }
  return null;
}

export type ResolveDateOptions = { now?: Date; direction?: DateDirection };

/**
 * "Friday tak" → next Friday, "kal" → tomorrow (future) / yesterday (past),
 * "5 din mein" → +5 days, "12/9" or "12 Sep" → that date. Null if no date found.
 */
export function resolveDate(input: string, options: ResolveDateOptions = {}): IsoDate | null {
  const today = todayIst(options.now);
  const direction = options.direction ?? "future";
  const sign = direction === "future" ? 1 : -1;
  const text = input.toLowerCase();

  // Written dates: 12/9, 12-09-2026, 12/9/26
  const numeric = text.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (numeric[3]) {
      const year = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
      return isValidDate(year, month, day) ? iso(year, month, day) : null;
    }
    return withInferredYear(day, month, today, direction);
  }

  // 12 Sep / 12 september
  const named = text.match(/\b(\d{1,2})\s*([a-z]{3,9})\b/);
  if (named && MONTHS[named[2]!] !== undefined) {
    return withInferredYear(Number(named[1]), MONTHS[named[2]!]!, today, direction);
  }

  const words: string[] = text.match(/[a-z]+|\d+/g) ?? [];
  const has = (...ws: string[]) => ws.some((w) => words.includes(w));

  if (has("aaj", "today", "abhi")) return today;
  if (has("parso", "parson")) return addDays(today, 2 * sign);
  if (has("tomorrow")) return addDays(today, 1);
  if (has("yesterday")) return addDays(today, -1);
  if (has("kal", "kaal")) return addDays(today, sign);

  // "5 din mein", "do din baad", "3 days"
  for (let i = 0; i < words.length - 1; i++) {
    const unit = words[i + 1]!;
    if (unit !== "din" && unit !== "days" && unit !== "day") continue;
    const raw = words[i]!;
    const n = /^\d+$/.test(raw) ? Number(raw) : SMALL_NUMBERS[raw];
    if (n !== undefined) return addDays(today, n * sign);
  }

  if (has("agle", "next") && has("hafte", "hafta", "week")) return addDays(today, 7);
  if (has("pichhle", "pichle", "last") && has("hafte", "hafta", "week")) return addDays(today, -7);
  if (has("agle", "next") && has("mahine", "mahina", "month")) return addMonths(today, 1);

  // Weekdays: the next one strictly after today (future) or the last one before today (past).
  for (const w of words) {
    const target = WEEKDAYS[w];
    if (target === undefined) continue;
    const current = weekday(today);
    let delta = direction === "future" ? (target - current + 7) % 7 : -((current - target + 7) % 7);
    if (delta === 0) delta = 7 * sign;
    return addDays(today, delta);
  }

  return null;
}
