import { CustomerDetailSchema, formatPaise } from "@hisaab/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PredictionLabel, StatusBadge } from "@/components/StatusBadge";
import { ApiFailure, apiFetch, requireShop } from "@/lib/api";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});
const showDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00+05:30`));

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireShop();
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await apiFetch(`/customers/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiFailure && err.status === 404) notFound();
    throw err;
  }
  const { customer, entries, promises } = CustomerDetailSchema.parse(raw);

  return (
    <AppShell>
      <Link href="/customers" className="inline-block min-h-12 py-3 text-sm font-medium underline">
        ← Khata
      </Link>
      <h1 className="text-3xl font-bold">{customer.name}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <StatusBadge status={customer.status} />
        <PredictionLabel prediction={customer.payPrediction} />
      </div>

      <section className="mt-4 rounded-lg border-2 border-neutral-900 p-4">
        <p className="text-sm text-neutral-600">
          {customer.balancePaise < 0 ? "Advance" : "Kul baaki (Balance due)"}
        </p>
        <p className="text-4xl font-bold tabular-nums">{formatPaise(Math.abs(customer.balancePaise))}</p>
        {customer.earliestDue && customer.balancePaise > 0 && (
          <p className="mt-1 text-neutral-700">Due date: {showDate(customer.earliestDue)}</p>
        )}
      </section>

      {/* Collect actions arrive in S2. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled
          className="min-h-14 rounded-lg border-2 border-neutral-300 font-semibold opacity-60"
        >
          Yaad dilayein <span className="block text-sm font-normal">Remind</span>
        </button>
        <button
          type="button"
          disabled
          className="min-h-14 rounded-lg border-2 border-neutral-300 font-semibold opacity-60"
        >
          Call (AI)
        </button>
      </div>

      {promises.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Vaade (Promises)</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {promises.map((p) => (
              <li key={p.id} className="flex justify-between rounded border border-neutral-200 px-3 py-2">
                <span>
                  {showDate(p.promisedDate)} {p.amountPaise ? `· ${formatPaise(p.amountPaise)}` : ""}
                </span>
                <span className="font-medium">
                  {p.status === "kept"
                    ? "Nibhaya (Kept)"
                    : p.status === "broken"
                      ? "Toota (Broken)"
                      : "Baaki (Open)"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Hisaab (History)</h2>
        <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {e.type === "payment" ? "Jama (Paid)" : "Udhaar (Credit)"}
                  <span className="ml-2 text-sm text-neutral-500">
                    {showDate(e.entryDate)} · {e.source}
                  </span>
                </p>
                {e.items && <p className="truncate text-sm text-neutral-600">{e.items}</p>}
              </div>
              <p
                className={`shrink-0 text-lg font-bold tabular-nums ${e.type === "payment" ? "text-green-700" : "text-red-700"}`}
              >
                {e.type === "payment" ? "−" : "+"}
                {formatPaise(e.amountPaise)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
