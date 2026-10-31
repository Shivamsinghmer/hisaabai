import { CollectDashboardSchema, formatPaise } from "@hisaab/shared";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CollectActions } from "@/components/CollectActions";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, requireShop } from "@/lib/api";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const showDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));
const OUTCOME: Record<string, string> = {
  promise: "Vaada (Promise)",
  paid: "Link bheja (Paying)",
  partial: "Aadha (Partial)",
  dispute: "Vivaad (Dispute)",
  no_answer: "Baad mein (Later)",
  refused: "Mana kiya (Refused)",
};

export default async function CollectPage() {
  await requireShop();
  const d = CollectDashboardSchema.parse(await apiFetch("/collect/dashboard"));

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">
        Udhaar wasooli <span className="text-base font-normal text-neutral-600">(Collect)</span>
      </h1>
      <section className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-neutral-200 p-2">
          <p className="text-lg font-bold tabular-nums">{formatPaise(d.totals.duePaise)}</p>
          <p className="text-sm">Kul baaki</p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-2">
          <p className="text-lg font-bold">{d.totals.overdueCount}</p>
          <p className="text-sm">Der se (Overdue)</p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-2">
          <p className="text-lg font-bold">{d.totals.brokenPromises}</p>
          <p className="text-sm">Toote vaade</p>
        </div>
      </section>

      {d.recentCalls.length > 0 && (
        <section className="mt-5">
          <h2 className="font-semibold">AI calls</h2>
          <ul className="mt-1 flex flex-col gap-1">
            {d.recentCalls.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/call/${c.id}`}
                  className="flex min-h-12 items-center justify-between rounded border border-neutral-200 px-3"
                >
                  <span>{c.customerName}</span>
                  <span className="text-sm font-medium">
                    {c.status === "ended" ? (OUTCOME[c.outcome ?? ""] ?? c.outcome) : "Chal rahi hai (Live)"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="mt-5 flex flex-col gap-3">
        {d.dues.slice(0, 25).map((c) => (
          <li key={c.id} className="rounded-lg border border-neutral-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/customers/${c.id}`}
                  className="text-lg font-semibold underline-offset-2 hover:underline"
                >
                  {c.name}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge status={c.status} />
                  {c.openPromiseDate && <span>Vaada: {showDate(c.openPromiseDate)}</span>}
                  {c.brokenPromises > 0 && (
                    <span className="text-red-700">{c.brokenPromises} toota vaada</span>
                  )}
                  {c.remindedToday && <span className="text-neutral-600">Aaj yaad dilaya ✓</span>}
                </div>
              </div>
              <p className="shrink-0 text-xl font-bold tabular-nums">{formatPaise(c.balancePaise)}</p>
            </div>
            <div className="mt-2">
              <CollectActions customerId={c.id} compact />
            </div>
          </li>
        ))}
      </ul>
      {d.dues.length === 0 && (
        <p className="mt-6 text-center text-neutral-600">Kisi ka udhaar baaki nahi 🎉</p>
      )}
    </AppShell>
  );
}
