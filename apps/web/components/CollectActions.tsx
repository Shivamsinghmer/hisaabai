"use client";

import { formatPaise, type Reminder } from "@hisaab/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { remindCustomer, startAiCall } from "@/app/collect/actions";

/** "Remind now" + "Call (AI)" for one customer (F1.5, F2.1, F2.2). */
export function CollectActions({ customerId, compact = false }: { customerId: string; compact?: boolean }) {
  const router = useRouter();
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const btn = `rounded-lg font-semibold disabled:opacity-50 ${compact ? "min-h-12 px-3 text-sm" : "min-h-14 px-4"}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pending}
          className={`${btn} border-2 border-neutral-900`}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await remindCustomer(customerId);
              if (res.ok) setReminder(res.data);
              else setError(res.error);
            })
          }
        >
          Yaad dilayein{!compact && <span className="block text-sm font-normal">Remind now</span>}
        </button>
        <button
          type="button"
          disabled={pending}
          className={`${btn} bg-neutral-900 text-white`}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await startAiCall(customerId);
              if (res.ok) router.push(`/call/${res.data.callId}`);
              else setError(res.error);
            })
          }
        >
          Call (AI){!compact && <span className="block text-sm font-normal">AI se call</span>}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {reminder && (
        <div className="rounded-lg border-2 border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm font-semibold">
            {reminder.tone === "firm" ? "Firm reminder" : "Gentle reminder"} ·{" "}
            {formatPaise(reminder.amountPaise)}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words">{reminder.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-12 rounded-lg border-2 border-neutral-900 px-3 text-sm font-semibold"
              onClick={async () => {
                await navigator.clipboard.writeText(reminder.message);
                setCopied(true);
              }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <a
              className="flex min-h-12 items-center rounded-lg border-2 border-green-700 px-3 text-sm font-semibold text-green-800"
              href={`https://wa.me/?text=${encodeURIComponent(reminder.message)}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
            <a
              className="flex min-h-12 items-center rounded-lg border-2 border-neutral-300 px-3 text-sm font-semibold"
              href={reminder.payUrl}
              target="_blank"
              rel="noreferrer"
            >
              Pay link kholein ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
