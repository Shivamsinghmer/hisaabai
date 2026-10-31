"use client";

import { formatPaise, type TeachBackResult } from "@hisaab/shared";
import { useState, useTransition } from "react";
import { acceptOffer, createOffer, grantLendingConsent, submitTeachBack } from "@/app/credit/actions";

type Offer = {
  id: string;
  amountPaise: number;
  tenureMonths: number;
  annualRatePct: number;
  emiPaise: number;
};

/**
 * F3.2/F3.3 flow: consent → offer card → teach-back → accept. Voice works via
 * the mic button on the shell; mic transcripts land in the teach-back box.
 */
export function CreditOffer({ initialScore }: { initialScore: number | null }) {
  const [step, setStep] = useState<"start" | "consent" | "offer" | "teach" | "done">("start");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [score, setScore] = useState<number | null>(initialScore);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<TeachBackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function requestOffer(grantConsent?: boolean) {
    setError(null);
    if (grantConsent) {
      const consent = await grantLendingConsent();
      if (!consent.ok) return setError(consent.error);
    }
    const res = await createOffer();
    if (!res.ok) return setError(res.error);
    if ("needsConsent" in res.data) {
      setStep("consent");
      return;
    }
    setOffer(res.data.offer);
    setScore(null);
    setStep("offer");
  }

  const btn = "min-h-14 w-full rounded-lg font-semibold disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4">
      {step === "start" && (
        <>
          <p className="text-neutral-700">
            Score {score ?? "—"} ke hisaab se dikhate hain ki aapko kitne ka loan ban sakta hai.
          </p>
          <button
            type="button"
            disabled={pending}
            className={`${btn} bg-neutral-900 text-white`}
            onClick={() => start(() => requestOffer(false))}
          >
            Score dekhein aur loan check karein <span className="block text-sm font-normal">Check loan</span>
          </button>
        </>
      )}

      {step === "consent" && (
        <>
          <p className="font-medium">Kya aap Paytm ko apna hisaab dikhane ki anumati dete hain?</p>
          <p className="text-sm text-neutral-600">
            Aapka score aur ledger data loan ke hisaab ke liye jaata hai. Anumati kabhi bhi wapas li ja sakti
            hai.
            <span className="block">
              (Allow Paytm to view your ledger for lending. You can revoke consent any time.)
            </span>
          </p>
          <button
            type="button"
            disabled={pending}
            className={`${btn} bg-neutral-900 text-white`}
            onClick={() => start(() => requestOffer(true))}
          >
            Anumati dein <span className="block text-sm font-normal">Grant consent</span>
          </button>
        </>
      )}

      {step === "offer" && offer && (
        <>
          <div className="rounded-xl border-2 border-green-600 p-4">
            <p className="text-sm font-semibold text-green-800">Loan offer (demo)</p>
            <p className="mt-1 text-4xl font-bold tabular-nums">{formatPaise(offer.amountPaise)}</p>
            <p className="mt-2 text-lg">
              Har mahine <strong className="tabular-nums">{formatPaise(offer.emiPaise)}</strong> ×{" "}
              <strong>{offer.tenureMonths} mahine</strong>
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              Byaaj {offer.annualRatePct}% per year. EMI 5 tareekh ko.
            </p>
          </div>
          <p className="font-medium">Ek baar aap batayein — har mahine kitna dena hoga, aur kitne mahine?</p>
          <p className="text-sm text-neutral-600">
            (Teach-back: apne shabdon mein kahein, taaki pakka samajh aaye. Mic button se bhi bole sakta hai.)
          </p>
          <textarea
            aria-label="Teach-back answer"
            className="min-h-20 w-full rounded-lg border-2 border-neutral-300 p-3"
            placeholder="jaise: har mahine 8850, kul 6 mahine"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button
            type="button"
            disabled={pending || answer.trim().length === 0}
            className={`${btn} bg-neutral-900 text-white`}
            onClick={() =>
              start(async () => {
                const res = await submitTeachBack(offer.id, answer.trim());
                if (!res.ok) return setError(res.error);
                setResult(res.data);
                setAnswer("");
                setError(null);
              })
            }
          >
            Batayein <span className="block text-sm font-normal">Submit teach-back</span>
          </button>
        </>
      )}

      {result && offer && step !== "done" && (
        <div className={`rounded-lg border-2 p-3 ${result.passed ? "border-green-600" : "border-amber-500"}`}>
          <p className="whitespace-pre-wrap break-words">{result.replyText}</p>
          {result.passed ? (
            <button
              type="button"
              disabled={pending}
              className={`mt-3 ${btn} bg-green-700 text-white`}
              onClick={() =>
                start(async () => {
                  const res = await acceptOffer(offer.id);
                  if (res.ok) setStep("done");
                  else setError(res.error);
                })
              }
            >
              Loan le lein <span className="block text-sm font-normal">Accept (demo disbursal)</span>
            </button>
          ) : (
            <p className="mt-2 text-sm text-neutral-600">
              Koshish {result.attempts}/2. Mic button se bhi bata sakte hain.
            </p>
          )}
        </div>
      )}

      {step === "done" && (
        <div className="rounded-xl border-2 border-green-600 p-4 text-center">
          <p className="text-xl font-bold text-green-800">Loan approve ✓</p>
          <p className="mt-1 text-sm text-neutral-600">
            Paise (demo) aapke khaate mein. EMI yaad rahegi: har mahine{" "}
            {offer ? formatPaise(offer.emiPaise) : ""}.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
