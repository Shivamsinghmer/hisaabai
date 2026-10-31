// F3.3 teach-back: the LLM (teach_back_judge.md) extracts the numbers the
// merchant said; code compares them with the real offer's EMI (±10% on the
// amount, exact tenure) and decides. Max 2 attempts, then a human fallback.
import { formatPaise } from "@hisaab/shared";
import type { LoanOffer, TeachBackAnswer } from "@hisaab/shared";

/** §14 F3.3: tolerance ±10% on the EMI amount, tenure must match exactly. */
export function judgeTeachBack(answer: TeachBackAnswer, offer: LoanOffer): boolean {
  if (!answer.emi_rupees || !answer.tenure_months) return false;
  const actualEmiRupees = offer.emiPaise / 100;
  const amountOk = Math.abs(answer.emi_rupees - actualEmiRupees) <= 0.1 * actualEmiRupees;
  return amountOk && answer.tenure_months === offer.tenureMonths;
}

export function failReply(offer: LoanOffer): string {
  return `Thoda dhyan se: har mahine ${formatPaise(offer.emiPaise)}, kul ${offer.tenureMonths} mahine. Phir se batayein?`;
}

export function giveUpReply(): string {
  return "Koi baat nahi. Paytm ke agent baat karenge aapse — phone par 2 minute.";
}

export function passReply(): string {
  return "Bilkul sahi! Aap samajh gaye. Aage badhein?";
}
