"use client";

import { formatPaise, type UdhaarTxn } from "@hisaab/shared";
import { useState, useTransition } from "react";
import { fundUdhaar } from "@/app/udhaar/actions";

/** Give one eligible customer udhaar through Paytm (F4, mock): Paytm pays the shop instantly. */
export function UdhaarFund({ customerId, limitPaise }: { customerId: string; limitPaise: number }) {
  const [amount, setAmount] = useState("");
  const [txn, setTxn] = useState<UdhaarTxn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const limitRupees = Math.floor(limitPaise / 100);
  const value = Number(amount);
  const valid = value > 0 && value <= limitRupees;

  if (txn) {
    return (
      <div className="border-2 border-green-700 bg-green-50 p-3">
        <p className="text-[17px] font-semibold">
          Paytm ne {formatPaise(txn.amountPaise - txn.feePaise)} turant bheje ✓
        </p>
        <p className="mt-1 text-[14px] text-quiet-gray">
          {formatPaise(txn.amountPaise)} udhaar · funding fee {formatPaise(txn.feePaise)} aap dete hain. Ab{" "}
          {txn.customerName} Paytm ko repay karenge, aapko wasooli nahi karni.
        </p>
        {txn.repayUrl && (
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={txn.repayUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center border-2 border-ledger-navy px-3 text-[15px] font-semibold"
            >
              Repayment link kholein ↗
            </a>
            <button
              type="button"
              className="min-h-12 border-2 border-steel-rule px-3 text-[15px] font-semibold"
              onClick={async () => {
                await navigator.clipboard.writeText(txn.repayUrl!);
                setCopied(true);
              }}
            >
              {copied ? "Copied ✓" : "Link copy karein"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        setError(null);
        start(async () => {
          const res = await fundUdhaar(customerId, value);
          if (res.ok) setTxn(res.txn);
          else setError(res.error);
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <label className="flex min-h-12 flex-1 items-center border-2 border-steel-rule px-3 text-[18px] focus-within:border-ledger-navy">
          <span className="mr-1 text-quiet-gray">₹</span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            placeholder={`max ${limitRupees}`}
            aria-label="Udhaar amount in rupees"
            className="num w-full bg-transparent outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={!valid || pending}
          className="min-h-12 bg-ledger-navy px-4 text-[16px] font-semibold text-paper-white disabled:opacity-40"
        >
          {pending ? "…" : "Paytm se udhaar dein"}
        </button>
      </div>
      {value > limitRupees && (
        <p className="text-[13px] font-medium text-red-700">Limit {formatPaise(limitPaise)} hai.</p>
      )}
      {error && (
        <p role="alert" className="text-[14px] font-medium text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
