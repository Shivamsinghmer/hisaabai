import { formatPaise, TodaySummarySchema } from "@hisaab/shared";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Label } from "@/components/Label";
import { apiFetch, requireShop } from "@/lib/api";
import { t } from "@/lib/strings";

export const dynamic = "force-dynamic";

export default async function Home() {
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
          <p className="text-neutral-600">{t.home.greeting(merchant.ownerName)}</p>
          <h1 className="text-3xl font-bold">{merchant.shopName}</h1>
        </div>
        <Link href="/me" className="min-h-12 px-2 py-3 text-sm font-medium underline">
          Account
        </Link>
      </div>

      <section aria-label="Today" className="mt-6 grid grid-cols-3 gap-2">
        {cards.map((card) => (
          <div key={card.label[1]} className="rounded-lg border border-neutral-200 p-3">
            <p className="text-xl font-bold tabular-nums">{formatPaise(card.value)}</p>
            <Label text={card.label} className="text-sm font-medium" />
          </div>
        ))}
      </section>

      <Link
        href="/customers"
        className="mt-4 flex min-h-16 items-center justify-between rounded-lg border-2 border-neutral-900 px-4 text-lg font-semibold"
      >
        <Label text={["Khata dekhein", "Customers & dues"]} />
        {summary.overdueCustomers > 0 && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
            {summary.overdueCustomers} der se (overdue)
          </span>
        )}
      </Link>

      <button
        type="button"
        disabled
        className="mt-3 flex min-h-16 w-full items-center justify-center rounded-lg border-2 border-neutral-300 px-4 text-lg font-semibold disabled:opacity-60"
      >
        <Label text={t.home.scanKhata} />
      </button>

      <p className="mt-8 text-center text-neutral-600">
        Mic daba kar boliye: <em>&ldquo;Gupta ji, do kilo chawal, 120 udhaar&rdquo;</em>
      </p>
    </AppShell>
  );
}
