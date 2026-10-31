"use client";

import { formatPaise, type PayInfo } from "@hisaab/shared";
import { useState, useTransition } from "react";
import { payNow } from "@/app/public-actions";

export function PayForm({ token, info }: { token: string; info: PayInfo }) {
  const [paid, setPaid] = useState<{ paidPaise: number; balancePaise: number } | null>(
    info.status === "paid" ? { paidPaise: 0, balancePaise: 0 } : null,
  );
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pay(amountRupees?: number) {
    setError(null);
    start(async () => {
      const res = await payNow(token, amountRupees);
      if (res.ok) setPaid({ paidPaise: res.data.paidPaise, balancePaise: res.data.balancePaise });
      else setError(res.error);
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-sky-50 p-5">
      <p className="w-fit rounded-full bg-amber-200 px-3 py-1 text-sm font-bold text-amber-900">
        DEMO — no real money
      </p>
      <header>
        <p className="text-sm font-semibold tracking-wide text-sky-800">Paytm UPI</p>
        <h1 className="text-2xl font-bold">{info.shopName}</h1>
        <p className="text-neutral-700">Customer: {info.customerName}</p>
        {info.kind === "paytm_udhaar" && (
          <p className="mt-2 border border-sky-700 bg-sky-100 p-2 text-[14px] font-medium text-ledger-navy">
            Paytm Udhaar: yeh payment dukaan ko nahi, Paytm ko jaa raha hai.
          </p>
        )}
      </header>

      {paid ? (
        <section className="rounded-2xl bg-white p-6 text-center shadow">
          <p className="text-6xl" aria-hidden>
            ✅
          </p>
          <p className="mt-2 text-2xl font-bold">Payment safal (Successful)</p>
          {paid.paidPaise > 0 && <p className="mt-1 text-lg">{formatPaise(paid.paidPaise)} bhej diye</p>}
          <p className="mt-1 text-neutral-700">
            {paid.balancePaise > 0 ? `Ab ${formatPaise(paid.balancePaise)} baaki` : "Ab koi baaki nahi"}
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow">
          <p className="text-neutral-600">{info.kind === "paytm_udhaar" ? "Repay to Paytm" : "Amount due"}</p>
          <p className="text-4xl font-bold tabular-nums">{formatPaise(info.amountPaise)}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => pay()}
            className="min-h-14 rounded-xl bg-sky-700 text-xl font-bold text-white disabled:opacity-50"
          >
            {pending ? "…" : `Pay ${formatPaise(info.amountPaise)} with UPI`}
          </button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(amount);
              if (n > 0) pay(n);
            }}
          >
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Thoda pay karein (₹)"
              aria-label="Partial amount in rupees"
              className="min-h-12 flex-1 rounded-lg border-2 border-neutral-300 px-3 text-lg"
            />
            <button
              type="submit"
              disabled={pending || !amount}
              className="min-h-12 rounded-lg border-2 border-sky-700 px-4 font-semibold"
            >
              Pay
            </button>
          </form>
          {error && <p className="font-medium text-red-700">{error}</p>}
        </section>
      )}
    </main>
  );
}
