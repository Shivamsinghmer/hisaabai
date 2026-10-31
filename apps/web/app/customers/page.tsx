import { CustomerRowSchema, formatPaise } from "@hisaab/shared";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { PredictionLabel, StatusBadge } from "@/components/StatusBadge";
import { apiFetch, requireShop } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requireShop();
  const { customers } = z
    .object({ customers: z.array(CustomerRowSchema) })
    .parse(await apiFetch("/customers"));
  const total = customers.reduce((sum, c) => sum + Math.max(0, c.balancePaise), 0);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">
        Khata <span className="text-base font-normal text-neutral-600">(Customers)</span>
      </h1>
      <p className="mt-1 text-lg">
        Kul baaki udhaar: <strong className="tabular-nums">{formatPaise(total)}</strong>
      </p>
      <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {customers.map((c) => (
          <li key={c.id}>
            <Link
              href={`/customers/${c.id}`}
              className="flex min-h-16 items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{c.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={c.status} />
                  <PredictionLabel prediction={c.payPrediction} />
                </div>
              </div>
              <p className="shrink-0 text-xl font-bold tabular-nums">
                {formatPaise(Math.abs(c.balancePaise))}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {customers.length === 0 && (
        <p className="mt-6 text-center text-neutral-600">
          Abhi koi customer nahi. Mic se boliye: &ldquo;Naya customer Meena didi, 80 ka udhaar&rdquo;
        </p>
      )}
    </AppShell>
  );
}
