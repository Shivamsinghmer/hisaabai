import { AppShell } from "@/components/AppShell";
import { Label } from "@/components/Label";
import { requireShop } from "@/lib/api";
import { t } from "@/lib/strings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { merchant } = await requireShop();

  return (
    <AppShell>
      <p className="text-neutral-600">{t.home.greeting(merchant.ownerName)}</p>
      <h1 className="text-3xl font-bold">{merchant.shopName}</h1>

      {/* Today's summary — real numbers arrive with the ledger in Phase 3. */}
      <section aria-label="Today" className="mt-6 grid grid-cols-3 gap-2">
        {[t.home.todaySales, t.home.udhaarDue, t.home.collected].map((label) => (
          <div key={label[1]} className="rounded-lg border border-neutral-200 p-3">
            <p className="text-2xl font-bold">—</p>
            <Label text={label} className="text-sm font-medium" />
          </div>
        ))}
      </section>

      <button
        type="button"
        disabled
        className="mt-6 flex min-h-16 w-full items-center justify-center rounded-lg border-2 border-neutral-900 px-4 text-lg font-semibold disabled:opacity-60"
      >
        <Label text={t.home.scanKhata} />
      </button>
      <p className="mt-2 text-center text-sm text-neutral-600">
        {t.home.comingSoon[0]} ({t.home.comingSoon[1]})
      </p>
    </AppShell>
  );
}
