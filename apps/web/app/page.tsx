import { formatPaise, TodaySummarySchema } from "@hisaab/shared";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Label } from "@/components/Label";
import { Landing } from "@/components/landing/Landing";
import { apiFetch, requireShop } from "@/lib/api";
import { auth } from "@/lib/auth/server";
import { t } from "@/lib/strings";

export const dynamic = "force-dynamic";

// Signed out → public landing page. Signed in → the shop's Home (onboarding if no shop yet).
export default async function Page() {
  const { data: session } = await auth.getSession();
  if (!session?.user) return <Landing />;
  return <Home />;
}

async function Home() {
  const { merchant } = await requireShop();
  const summary = TodaySummarySchema.parse(await apiFetch("/summary/today"));

  const cards = [
    { label: t.home.todaySales, value: summary.salesPaise },
    { label: t.home.udhaarDue, value: summary.udhaarDuePaise },
    { label: t.home.collected, value: summary.collectedPaise },
  ];

  return (
    <AppShell>
      <div className="flex items-start justify-between">
        <div>
          <p className="mono text-[12px] text-quiet-gray">{t.home.greeting(merchant.ownerName)}</p>
          <h1 className="mt-1 text-[32px] leading-[1.05]">{merchant.shopName}</h1>
        </div>
        <Link href="/me" className="mono min-h-12 px-2 py-3 text-[12px] underline underline-offset-4">
          Account
        </Link>
      </div>

      <section aria-label="Today" className="mt-6 grid grid-cols-3 border border-rule-gray">
        {cards.map((card, i) => (
          <div
            key={card.label[1]}
            className={`bg-mint-paper p-3 ${i > 0 ? "border-l border-rule-gray" : ""}`}
          >
            <p className="font-display text-[26px] leading-none tabular-nums">{formatPaise(card.value)}</p>
            <Label text={card.label} className="mt-2 block text-[13px] font-medium leading-tight" />
          </div>
        ))}
      </section>

      <Link
        href="/customers"
        className="mt-4 flex min-h-16 items-center justify-between border border-steel-rule px-4 text-[18px] font-medium"
      >
        <Label text={["Khata dekhein", "Customers & dues"]} />
        {summary.overdueCustomers > 0 && (
          <span className="mono bg-red-100 px-2 py-1 text-[12px] text-red-800">
            {summary.overdueCustomers} der se · overdue
          </span>
        )}
      </Link>

      <Link
        href="/credit"
        className="mt-3 flex min-h-16 items-center justify-between border border-ledger-navy bg-ledger-navy px-4 text-[18px] font-medium text-paper-white"
      >
        <Label text={["Credit score dekhein", "Score & loan"]} />
        <span aria-hidden className="mono">
          →
        </span>
      </Link>

      <button
        type="button"
        disabled
        className="mt-3 flex min-h-16 w-full items-center justify-center border border-dashed border-steel-rule px-4 text-[18px] font-medium disabled:opacity-60"
      >
        <Label text={t.home.scanKhata} />
      </button>

      <p className="mt-8 text-center text-quiet-gray">
        <span className="mono block text-[12px]">Mic daba kar boliye</span>
        <em className="mt-1 block not-italic">&ldquo;Gupta ji, do kilo chawal, 120 udhaar&rdquo;</em>
      </p>
    </AppShell>
  );
}
