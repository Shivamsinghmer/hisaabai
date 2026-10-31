import { formatPaise, type NetworkBand, type NetworkProfile, type ShopStanding } from "@hisaab/shared";
import { NetworkConsentButton } from "./NetworkConsentButton";

// Paytm customer profile (owner only): this customer's udhaar record across every shop on
// Hisaab AI, with the AI's summary about them. Other shops stay anonymous.

const BAND: Record<NetworkBand, { label: string; english: string; className: string }> = {
  trusted: { label: "Bharosemand", english: "Trusted", className: "bg-green-100 text-green-800" },
  good: { label: "Theek", english: "Good", className: "bg-sky-paper text-ledger-navy" },
  watch: { label: "Dhyan dein", english: "Watch", className: "bg-amber-100 text-amber-900" },
  risky: { label: "Jokhim", english: "Risky", className: "bg-red-100 text-red-800" },
};

const STANDING: Record<ShopStanding, { label: string; className: string }> = {
  good: { label: "Samay par · On time", className: "bg-green-100 text-green-800" },
  late: { label: "Thoda late · Late", className: "bg-amber-100 text-amber-900" },
  overdue: { label: "Purana baaki · Overdue", className: "bg-red-100 text-red-800" },
  disputed: { label: "Vivaad · Disputed", className: "bg-neutral-100 text-ink-black" },
  new: { label: "Naya · New", className: "bg-neutral-100 text-ink-black" },
};

function Heading() {
  return (
    <h2 className="text-[20px] leading-tight">
      Paytm profile{" "}
      <span className="block text-[14px] font-normal text-quiet-gray">
        Sabhi dukaanon ka hisaab · Record across shops
      </span>
    </h2>
  );
}

export function NetworkProfileCard({ profile, customerId }: { profile: NetworkProfile; customerId: string }) {
  if (profile.status === "no_phone") {
    return (
      <section className="border border-dashed border-steel-rule p-4">
        <Heading />
        <p className="mt-2 text-[15px] text-quiet-gray">
          Phone number jodne par doosri dukaanon ka hisaab dikhega. (Add a phone number to see this.)
        </p>
      </section>
    );
  }

  if (profile.status === "no_consent") {
    return (
      <section className="border border-steel-rule p-4">
        <Heading />
        <p className="mt-2 text-[15px]">
          Customer ne abhi anumati nahi di hai. Unke phone {profile.phoneMasked} par anumati ka sandesh
          jaayega; haan kehne par hi doosri dukaanon ka hisaab dikhega.
        </p>
        <p className="mt-1 text-[13px] text-quiet-gray">
          The customer must agree before any shop sees their record from other shops.
        </p>
        <div className="mt-3">
          <NetworkConsentButton customerId={customerId} />
        </div>
      </section>
    );
  }

  const band = BAND[profile.band];
  return (
    <section className="border border-ledger-navy">
      <div className="p-4">
        <Heading />
        <div className="mt-3 flex items-end gap-3">
          <p className="num text-[44px] leading-none font-bold">{profile.score}</p>
          <span className={`mb-1 inline-block px-2 py-0.5 text-[13px] font-semibold ${band.className}`}>
            {band.label} <span className="font-normal opacity-75">· {band.english}</span>
          </span>
        </div>
        <p className="mt-1 text-[13px] text-quiet-gray">300–900 · {profile.shops.length} dukaanein</p>

        {/* The AI's summary about the customer, then what to do. */}
        <p className="mt-4 text-[16px] leading-relaxed">{profile.summary}</p>
        <p className="mt-3 border-l-4 border-ledger-navy bg-sky-paper px-3 py-2 text-[15px] font-medium">
          {profile.advice}
        </p>
      </div>

      <ul className="divide-y divide-rule-gray border-t border-rule-gray">
        {profile.shops.map((s) => {
          const st = STANDING[s.standing];
          return (
            <li key={s.label} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className={`text-[16px] ${s.isThisShop ? "font-bold" : "font-semibold"}`}>{s.label}</p>
                <span className={`mt-1 inline-block px-2 py-0.5 text-[12px] font-semibold ${st.className}`}>
                  {st.label}
                </span>
                {s.onTimeRate !== null && (
                  <p className="mt-1 text-[13px] text-quiet-gray">
                    {Math.round(s.onTimeRate * 100)}% samay par · {Math.round(s.historyDays / 30)} mahine
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="num text-[18px] font-bold">
                  {s.outstandingPaise > 0 ? formatPaise(s.outstandingPaise) : "—"}
                </p>
                {s.overdueDays > 0 && <p className="text-[13px] text-quiet-gray">{s.overdueDays} din se</p>}
                {s.penalty > 0 && (
                  <p className="num text-[13px] font-semibold text-red-700">−{s.penalty} score</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {profile.penaltyTotal > 0 && (
        <p className="border-t border-rule-gray px-4 py-3 text-[14px]">
          Purana baaki chukane par score <span className="num font-bold">{profile.baseScore}</span> ho
          jaayega. <span className="text-quiet-gray">(Settling the overdue balance restores the score.)</span>
        </p>
      )}

      <details className="border-t border-rule-gray px-4 py-3">
        <summary className="min-h-10 cursor-pointer text-[15px] font-semibold">
          Score kaise bana? <span className="font-normal text-quiet-gray">· How it works</span>
        </summary>
        <ul className="mt-2 flex flex-col gap-1 text-[14px]">
          {profile.factors.map((f) => (
            <li key={f.key} className="flex justify-between gap-3">
              <span>{f.label}</span>
              <span className="num shrink-0 text-quiet-gray">
                {Math.round(f.value * 100)}% · {Math.round(f.weight * 100)}% wazan
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-quiet-gray">
          30 din se zyada purane baaki par alag se score katta hai; vivaad wale baaki par sirf 20%.
        </p>
      </details>

      <p className="border-t border-rule-gray px-4 py-2 text-[12px] text-quiet-gray">
        {profile.phoneMasked} · Customer ki anumati se · Doosri dukaanon ke naam nahi dikhaye jaate · Demo
      </p>
    </section>
  );
}
