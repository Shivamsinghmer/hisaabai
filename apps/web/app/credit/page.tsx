import { CreditScoreSchema, type CreditScore } from "@hisaab/shared";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { apiFetch, ApiFailure, requireShop } from "@/lib/api";

export const dynamic = "force-dynamic";

const FACTOR_LABEL: Record<string, string> = {
  recovery_rate: "Udhaar wapasi (Recovery)",
  sales_consistency: "Sale ka ek rupanta (Consistency)",
  promise_reliability: "Vaade nibhaana (Promises kept)",
  digital_share: "UPI hissedaari (Digital share)",
  avg_days_to_recover: "Wasooli ki raftar (Recovery speed)",
  tenure_months: "Khata ki umar (Ledger age)",
  debtor_concentration: "Bade grahakon ka udhaar (Concentration)",
};

function gaugeColor(score: number): { bar: string; text: string; word: string } {
  if (score >= 680) return { bar: "bg-green-600", text: "text-green-700", word: "Achha (Good)" };
  if (score >= 600) return { bar: "bg-amber-500", text: "text-amber-700", word: "Theek (Fair)" };
  return { bar: "bg-red-600", text: "text-red-700", word: "Kamzor (Low)" };
}

export default async function CreditPage() {
  const { membership } = await requireShop();
  if (membership.role !== "owner") {
    return (
      <AppShell>
        <h1 className="text-2xl font-bold">Credit</h1>
        <p className="mt-6 text-neutral-700">
          Yeh hisaab sirf dukaan ke maalik dekh sakte hain.
          <span className="block text-sm text-neutral-500">Only the shop owner can view credit.</span>
        </p>
        <Link href="/" className="mt-6 inline-block min-h-12 rounded-lg border-2 border-neutral-900 px-4 py-3 font-semibold">
          Ghar jayein
        </Link>
      </AppShell>
    );
  }

  let score: CreditScore;
  try {
    score = CreditScoreSchema.parse(await apiFetch("/credit/score"));
  } catch (err) {
    if (err instanceof ApiFailure && err.status >= 500) {
      return (
        <AppShell>
          <p className="mt-6 font-medium">Score abhi ban nahi paya, thodi der mein koshish karein.</p>
        </AppShell>
      );
    }
    throw err;
  }
  const gauge = gaugeColor(score.score);
  const top = [...score.factors].sort((a, b) => b.points - a.points).slice(0, 3);
  const weak = [...score.factors].sort((a, b) => a.points - b.points).slice(0, 3);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">
        Credit score <span className="text-base font-normal text-neutral-600">(Kya loan ban sakta hai)</span>
      </h1>

      <section className="mt-6 rounded-xl border-2 border-neutral-200 p-5 text-center">
        <p className={`text-6xl font-bold tabular-nums ${gauge.text}`}>{score.score}</p>
        <p className={`mt-1 font-semibold ${gauge.text}`}>{gauge.word}</p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-neutral-200">
          <div className={`h-3 rounded-full ${gauge.bar}`} style={{ width: `${((score.score - 300) / 600) * 100}%` }} />
        </div>
        <p className="mt-2 text-sm text-neutral-600">Scale 300–900 ·{" "}
          {score.change !== null && (
            <span className={score.change >= 0 ? "text-green-700" : "text-red-700"}>
              {score.change >= 0 ? "↑" : "↓"} {Math.abs(score.change)} pichhli baar se
            </span>
          )}
        </p>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-2">
        <h2 className="font-semibold">Majboot hisse (Top factors)</h2>
        <ul className="flex flex-col gap-1">
          {top.map((f) => (
            <li key={f.key} className="flex min-h-10 items-center justify-between rounded border border-neutral-200 px-3 text-sm">
              <span>{FACTOR_LABEL[f.key] ?? f.key}</span>
              <span className="font-semibold text-green-700">
                {f.direction === "up" ? "↑" : "↓"} {f.points}
              </span>
            </li>
          ))}
        </ul>
        <h2 className="mt-3 font-semibold">Kamzor hisse</h2>
        <ul className="flex flex-col gap-1">
          {weak.map((f) => (
            <li key={f.key} className="flex min-h-10 items-center justify-between rounded border border-neutral-200 px-3 text-sm">
              <span>{FACTOR_LABEL[f.key] ?? f.key}</span>
              <span className="font-semibold text-red-700">{f.points}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-5">
        <h2 className="font-semibold">Score kaise badhayein (How to improve)</h2>
        <ul className="mt-1 list-disc pl-5 text-sm leading-6">
          {score.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>

      <Link
        href="/credit/offer"
        className="mt-6 flex min-h-14 items-center justify-center rounded-lg bg-neutral-900 px-4 text-lg font-semibold text-white"
      >
        Loan check karein <span className="ml-2 text-sm font-normal">Check loan</span>
      </Link>
    </AppShell>
  );
}
