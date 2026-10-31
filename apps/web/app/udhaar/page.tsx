import { formatPaise, UdhaarOverviewSchema } from "@hisaab/shared";
import { AppShell } from "@/components/AppShell";
import { UdhaarFund } from "@/components/UdhaarFund";
import { apiFetch, requireShop } from "@/lib/api";

export const dynamic = "force-dynamic";

const STATUS = {
  offered: { label: "Offer", className: "bg-neutral-100 text-ink-black" },
  funded: { label: "Paytm ne diya · customer repay karega", className: "bg-amber-100 text-amber-900" },
  repaying: { label: "Repay ho raha hai", className: "bg-amber-100 text-amber-900" },
  closed: { label: "Band · Repaid", className: "bg-green-100 text-green-800" },
  defaulted: { label: "Default", className: "bg-red-100 text-red-800" },
} as const;

// F4 Udhaar-as-a-Service (mock, no real money). Owner only, like credit.
export default async function UdhaarPage() {
  const { membership } = await requireShop();
  if (membership.role !== "owner") {
    return (
      <AppShell>
        <h1 className="text-2xl">Paytm Udhaar</h1>
        <p className="mt-4 text-[17px]">Yeh sirf dukaan ke maalik dekh sakte hain. (Owner only)</p>
      </AppShell>
    );
  }
  const o = UdhaarOverviewSchema.parse(await apiFetch("/udhaar-service"));

  return (
    <AppShell>
      <h1 className="text-[28px] leading-tight">
        Paytm Udhaar <span className="block text-base font-normal text-quiet-gray">Udhaar-as-a-Service</span>
      </h1>

      <section className="mt-4 border border-ledger-navy bg-sky-paper p-4">
        <p className="text-[17px] font-semibold">Udhaar aap dein, risk Paytm ka.</p>
        <ul className="mt-2 flex flex-col gap-1 text-[15px]">
          <li>1. Bharosemand customer ko udhaar dein: Paytm aapko turant paise bhejta hai.</li>
          <li>2. Customer Paytm ko repay karta hai. Aapko wasooli nahi karni.</li>
          <li>
            3. Funding fee {o.feePct}% aap dete hain. Customer par koi extra charge nahi: ₹500 udhaar = ₹500
            due.
          </li>
        </ul>
        <p className="mt-2 text-[13px] text-quiet-gray">Demo: koi asli paisa nahi jaata. Mock Paytm.</p>
      </section>

      <h2 className="mt-6 text-[20px]">
        Paytm Udhaar available{" "}
        <span className="text-[14px] font-normal text-quiet-gray">· {o.eligible.length}</span>
      </h2>
      <ul className="mt-2 flex flex-col gap-3">
        {o.eligible.map((c) => (
          <li key={c.customerId} className="border border-steel-rule p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[18px] font-semibold">{c.name}</p>
                <p className="text-[13px] text-quiet-gray">
                  {Math.round(c.onTimeRate * 100)}% samay par wapasi · {Math.round(c.historyDays / 30)} mahine
                  ka hisaab
                </p>
              </div>
              <p className="shrink-0 text-right">
                <span className="num block text-[22px] leading-none font-bold">
                  {formatPaise(c.limitPaise)}
                </span>
                <span className="text-[12px] text-quiet-gray">limit</span>
              </p>
            </div>
            <div className="mt-3">
              <UdhaarFund customerId={c.customerId} limitPaise={c.limitPaise} />
            </div>
          </li>
        ))}
      </ul>
      {o.eligible.length === 0 && (
        <p className="mt-2 text-quiet-gray">
          Abhi koi customer eligible nahi. Hisaab badhne par yahan dikhenge.
        </p>
      )}

      {o.txns.length > 0 && (
        <>
          <h2 className="mt-8 text-[20px]">Paytm Udhaar history</h2>
          <ul className="mt-2 divide-y divide-rule-gray border border-rule-gray">
            {o.txns.map((t) => {
              const s = STATUS[t.status];
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold">{t.customerName}</p>
                    <span
                      className={`mt-1 inline-block px-2 py-0.5 text-[12px] font-semibold ${s.className}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  <p className="num shrink-0 text-[18px] font-bold">{formatPaise(t.amountPaise)}</p>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {o.notEligible.length > 0 && (
        <details className="mt-8 border border-rule-gray p-3">
          <summary className="min-h-10 cursor-pointer text-[16px] font-semibold">
            Abhi eligible nahi <span className="font-normal text-quiet-gray">· Not yet eligible</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-3">
            {o.notEligible.map((c) => (
              <li key={c.customerId}>
                <p className="font-semibold">{c.name}</p>
                {c.reasons.map((r) => (
                  <p key={r} className="text-[13px] text-quiet-gray">
                    {r}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </AppShell>
  );
}
