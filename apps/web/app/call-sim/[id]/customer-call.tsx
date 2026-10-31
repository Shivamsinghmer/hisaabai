"use client";

import type { CallState } from "@hisaab/shared";
import { useEffect, useRef, useState, useTransition } from "react";
import { answerCall, getPublicCall, sendCustomerAudio, sendCustomerText } from "@/app/public-actions";
import { CallTranscript } from "@/components/CallTranscript";
import { HoldToTalk } from "@/components/HoldToTalk";
import { playReply, stopReply } from "@/lib/audio";

/** Customer side of the simulated call: ring → answer → hear the agent → talk back. */
export function CustomerCall({ initial }: { initial: CallState }) {
  const [call, setCall] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const played = useRef(0);

  // Speak each new agent line once (after the customer has answered).
  useEffect(() => {
    if (call.status === "ringing") return;
    const agentTurns = call.transcript.filter((t) => t.role === "agent");
    const latest = agentTurns.at(-1);
    if (agentTurns.length > played.current && latest?.audioUrl) {
      played.current = agentTurns.length;
      void playReply(latest.audioUrl).catch(() => setNotice("Awaaz ke liye 'Phir se sunein' dabayein"));
    }
  }, [call]);

  // Pick up state changes made elsewhere (e.g. the merchant ends the call).
  useEffect(() => {
    if (call.status === "ended") return;
    const id = window.setInterval(async () => {
      if (pending) return;
      const res = await getPublicCall(call.id);
      if (res.ok && res.data.transcript.length >= call.transcript.length) setCall(res.data);
    }, 3000);
    return () => window.clearInterval(id);
  }, [call.id, call.status, call.transcript.length, pending]);

  function apply(res: Awaited<ReturnType<typeof sendCustomerText>>) {
    if (!res.ok) return setNotice(res.error);
    setCall(res.data.call);
    setNotice(res.data.understood ? null : "Samajh nahi aaya, dobara boliye ya likhiye");
  }

  if (call.status === "ringing") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 bg-neutral-900 p-6 text-white">
        <p className="text-lg opacity-80">Incoming call</p>
        <p className="text-3xl font-bold">{call.shopName}</p>
        <p className="animate-pulse text-6xl" aria-hidden>
          📞
        </p>
        <button
          type="button"
          className="min-h-16 w-full rounded-full bg-green-600 text-xl font-bold"
          onClick={() =>
            start(async () => {
              const res = await answerCall(call.id);
              if (res.ok) setCall(res.data);
            })
          }
        >
          Uthayein (Answer)
        </button>
      </main>
    );
  }

  const ended = call.status === "ended";
  const lastAgent = call.transcript.filter((t) => t.role === "agent").at(-1);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header>
        <p className="text-sm text-neutral-600">{ended ? "Call khatam (Ended)" : "Call chal rahi hai"}</p>
        <h1 className="text-2xl font-bold">{call.shopName}</h1>
        <p className="text-neutral-600">Aap: {call.customerName}</p>
      </header>

      <CallTranscript turns={call.transcript} customerName={call.customerName} />

      {notice && <p className="font-medium text-amber-800">{notice}</p>}
      {lastAgent?.audioUrl && (
        <button
          type="button"
          className="min-h-12 w-fit rounded-lg border-2 border-neutral-300 px-3 font-semibold"
          onClick={() => void playReply(lastAgent.audioUrl!).catch(() => {})}
        >
          Phir se sunein (Play again)
        </button>
      )}

      {call.payUrl && (
        <a
          href={call.payUrl}
          className="flex min-h-14 items-center justify-center rounded-lg bg-sky-700 text-lg font-bold text-white"
        >
          Paytm se pay karein →
        </a>
      )}

      {!ended && (
        <div className="mt-auto flex flex-col gap-3 pb-4">
          {pending ? (
            <p className="text-center font-semibold">Sun rahe hain…</p>
          ) : (
            <HoldToTalk
              onAudio={(audio) =>
                start(async () => {
                  stopReply();
                  const form = new FormData();
                  form.append("audio", audio);
                  apply(await sendCustomerAudio(call.id, form));
                })
              }
            />
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = text.trim();
              if (!value) return;
              setText("");
              start(async () => apply(await sendCustomerText(call.id, value)));
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Friday ko dunga"
              aria-label="Type your reply"
              className="min-h-12 flex-1 rounded-lg border-2 border-neutral-300 px-3 text-lg"
            />
            <button
              type="submit"
              disabled={pending}
              className="min-h-12 rounded-lg bg-neutral-900 px-4 font-semibold text-white"
            >
              Bhejein
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
