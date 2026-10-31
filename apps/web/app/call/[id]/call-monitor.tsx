"use client";

import { formatPaise, type CallState } from "@hisaab/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { endAiCall, getCallForMerchant } from "@/app/collect/actions";
import { CallTranscript } from "@/components/CallTranscript";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const OUTCOME: Record<string, string> = {
  promise: "Vaada mila (Promise to pay)",
  paid: "Payment link bheja (Paying now)",
  partial: "Thoda abhi, baaki baad mein (Partial)",
  dispute: "Vivaad — aap khud baat karein (Dispute)",
  no_answer: "Baad mein call karenge (Call back later)",
  refused: "Mana kar diya (Refused)",
};

/** Merchant's view of an AI call: polls the call (SSE is cut for the demo). */
export function CallMonitor({ initial, joinUrl }: { initial: CallState; joinUrl: string }) {
  const [call, setCall] = useState(initial);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (call.status === "ended") return;
    const id = window.setInterval(async () => {
      const res = await getCallForMerchant(call.id);
      if (res.ok) setCall(res.data);
    }, 1500);
    return () => window.clearInterval(id);
  }, [call.id, call.status]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-neutral-600">AI call · {formatPaise(call.amountPaise)} baaki</p>
        <h1 className="text-2xl font-bold">{call.customerName}</h1>
        <p className="mt-1 font-semibold">
          {call.status === "ringing" && "📞 Ghanti baj rahi hai… (Ringing)"}
          {call.status === "live" && "🟢 Baat chal rahi hai (Live)"}
          {call.status === "ended" && `Call khatam — ${OUTCOME[call.outcome ?? ""] ?? call.outcome ?? ""}`}
        </p>
      </div>

      {call.status !== "ended" && (
        <div className="rounded-lg border-2 border-dashed border-neutral-300 p-3">
          <p className="text-sm font-semibold">
            Customer ka phone (demo): yeh link doosre tab/phone mein kholein
          </p>
          <p className="mt-1 break-all text-sm">{joinUrl}</p>
          <div className="mt-2 flex gap-2">
            <a
              href={joinUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center rounded-lg bg-neutral-900 px-3 font-semibold text-white"
            >
              Kholein ↗
            </a>
            <button
              type="button"
              className="min-h-12 rounded-lg border-2 border-neutral-900 px-3 font-semibold"
              onClick={async () => {
                await navigator.clipboard.writeText(joinUrl);
                setCopied(true);
              }}
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
        </div>
      )}

      <CallTranscript turns={call.transcript} customerName={call.customerName} />

      {call.promise && (
        <div className="rounded-lg border-2 border-green-700 bg-green-50 p-3">
          <p className="font-semibold">
            Vaada: {dateFmt.format(new Date(`${call.promise.promisedDate}T00:00:00Z`))}
            {call.promise.amountPaise ? ` · ${formatPaise(call.promise.amountPaise)}` : ""}
          </p>
          {call.followUpAt && (
            <p className="text-sm">Follow-up set: {timeFmt.format(new Date(call.followUpAt))}</p>
          )}
        </div>
      )}
      {call.payUrl && (
        <p className="text-sm">
          Payment link:{" "}
          <a href={call.payUrl} target="_blank" rel="noreferrer" className="break-all underline">
            {call.payUrl}
          </a>
        </p>
      )}

      <div className="flex gap-2">
        {call.status !== "ended" && (
          <button
            type="button"
            className="min-h-12 rounded-lg border-2 border-red-700 px-4 font-semibold text-red-800"
            onClick={async () => {
              const res = await endAiCall(call.id);
              if (res.ok) setCall(res.data);
            }}
          >
            Call band karein (End)
          </button>
        )}
        <Link
          href="/collect"
          className="flex min-h-12 items-center rounded-lg border-2 border-neutral-300 px-4 font-semibold"
        >
          ← Wasooli
        </Link>
      </div>
    </div>
  );
}
