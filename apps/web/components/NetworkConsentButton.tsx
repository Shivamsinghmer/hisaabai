"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestNetworkConsent } from "@/app/customers/[id]/actions";

/** Mock: stands in for the customer saying yes on their own phone. */
export function NetworkConsentButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        className="min-h-12 w-full bg-ledger-navy px-4 text-[16px] font-semibold text-paper-white disabled:opacity-50"
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await requestNetworkConsent(customerId);
            if (res.ok) router.refresh();
            else setError(res.error);
          })
        }
      >
        {pending ? "…" : "Anumati maangein · Ask consent"}
      </button>
      <p className="text-[12px] text-quiet-gray">Demo: customer ki haan turant maan li jaati hai.</p>
      {error && (
        <p role="alert" className="text-[14px] font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
