// What the mic says back, per intent. Phase 2 ships placeholders that prove the
// routing works; each feature phase replaces its handler with the real flow
// (capture → Phase 3, collect → 5/6, credit → 7, ask/stock → 8).
import { formatPaise, parseAmountRupees, rupeesToPaise, type Intent, type Role } from "@hisaab/shared";

export const NOT_UNDERSTOOD = "Samajh nahi aaya, dobara bolein.";
const OWNER_ONLY = "Yeh sirf dukaan ke maalik dekh sakte hain.";
const SOON = "Yeh suvidha jald aa rahi hai.";

/** Intents a helper may not use (§2: helpers add entries only). */
const OWNER_INTENTS = new Set<Intent>(["credit", "settings"]);

export function replyFor(intent: Intent, transcript: string, role: Role): string {
  if (role !== "owner" && OWNER_INTENTS.has(intent)) return OWNER_ONLY;

  const amount = parseAmountRupees(transcript);
  const money = amount !== null ? formatPaise(rupeesToPaise(amount)) : null;

  switch (intent) {
    case "capture":
      return money ? `Samajh gaya: ${money} ki udhaar entry. ${SOON}` : `Samajh gaya: nayi entry. ${SOON}`;
    case "payment":
      return money ? `Samajh gaya: ${money} jama. ${SOON}` : `Samajh gaya: payment. ${SOON}`;
    case "collect":
      return `Samajh gaya: udhaar wasooli. ${SOON}`;
    case "credit":
      return `Samajh gaya: loan aur credit score. ${SOON}`;
    case "ask":
      return `Samajh gaya: dukaan ka hisaab. ${SOON}`;
    case "stock":
      return `Samajh gaya: stock. ${SOON}`;
    case "settings":
      return `Samajh gaya: settings. ${SOON}`;
    case "other":
      return NOT_UNDERSTOOD;
  }
}
