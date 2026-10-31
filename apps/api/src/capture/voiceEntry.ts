// F1.2 voice entry → ledger. "Gupta ji, do kilo chawal, 120 udhaar" →
// credit ₹120 to Gupta ji → "Gupta ji ke khate mein ₹120 udhaar jod diya. Ab kul ₹450 baaki."
// Anything missing or ambiguous gets one short follow-up (§17) instead of a guess.
import {
  addDays,
  ExtractedEntrySchema,
  formatPaise,
  parseAmountRupees,
  resolveDate,
  rupeesToPaise,
  todayIst,
  type ExtractedEntry,
  type FollowUpOption,
  type LedgerEntrySummary,
  type Merchant,
  type VoiceConfirm,
} from "@hisaab/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/client.js";
import { balanceOf, customerCandidates, lastEntryFor, recentDuplicate } from "../db/repos/ledger.js";
import type { Membership } from "../db/repos/merchants.js";
import { customers, ledgerEntries } from "../db/schema.js";
import { renderPrompt } from "../prompts/loader.js";
import { mockExtract } from "../services/mock.js";
import type { LlmService } from "../services/types.js";
import { matchCustomer } from "./matchCustomer.js";

export type LedgerCommandResult = {
  replyText: string;
  entry: LedgerEntrySummary | null;
  followUp: { question: string; options: FollowUpOption[] } | null;
};

const ask = (question: string, options: FollowUpOption[] = []): LedgerCommandResult => ({
  replyText: question,
  entry: null,
  followUp: { question, options },
});
const NO = { label: "Nahi" };

async function extract(
  llm: LlmService,
  transcript: string,
  names: string[],
  log: Pick<FastifyBaseLogger, "warn">,
) {
  try {
    const prompt = renderPrompt("extract_entry", {
      today: todayIst(),
      customers: names.slice(0, 80).join(", ") || "(none yet)",
    });
    return await llm.chatJson({
      op: "extract_entry",
      system: prompt.text,
      user: transcript,
      schema: ExtractedEntrySchema,
    });
  } catch (err) {
    log.warn({ err: (err as Error).message }, "extraction fell back to rules");
    return mockExtract(transcript);
  }
}

/** A clean utterance for a follow-up button ("Ramesh Gupta, 120 udhaar"). */
function utterance(name: string, ext: ExtractedEntry, amount: number) {
  const items = ext.items ? `${ext.items}, ` : "";
  return `${name}, ${items}${amount} ${ext.kind === "payment" ? "jama" : "udhaar"}`;
}

export async function handleLedgerCommand(args: {
  db: Db;
  llm: LlmService;
  log: Pick<FastifyBaseLogger, "warn" | "info">;
  merchant: Merchant;
  membership: Membership;
  transcript: string;
  confirm?: VoiceConfirm;
}): Promise<LedgerCommandResult> {
  const { db, merchant, membership, transcript, confirm } = args;
  const candidates = await customerCandidates(db, merchant.id);
  const ext = await extract(
    args.llm,
    transcript,
    candidates.map((c) => c.name),
    args.log,
  );

  if (ext.kind === "unknown") return ask("Samajh nahi aaya. Jaise boliye: 'Gupta ji, 120 udhaar'.");
  if (!ext.customer_name) return ask("Kis customer ka? Naam ke saath dobara boliye.");

  // Deterministic parser wins over the LLM for the amount; it can't hallucinate.
  const parsed = parseAmountRupees(transcript);
  if (parsed !== null && ext.amount_rupees !== null && parsed !== ext.amount_rupees) {
    args.log.info({ parsed, llm: ext.amount_rupees }, "amount mismatch; using parser");
  }
  const amount = parsed ?? ext.amount_rupees;

  // Who?
  const match = matchCustomer(ext.customer_name, candidates);
  let customer: { id: string; name: string } | null = null;
  let created = false;
  if (match.kind === "match") customer = match.customer;
  else if (match.kind === "ambiguous") {
    const [a, b] = match.options;
    if (ext.kind === "delete_last" || amount === null) return ask(`Kaunse? ${a!.name} ya ${b!.name}?`);
    return ask(`Kaunse ${ext.customer_name}? ${a!.name} ya ${b!.name}?`, [
      { label: a!.name, text: utterance(a!.name, ext, amount) },
      { label: b!.name, text: utterance(b!.name, ext, amount) },
    ]);
  } else if (ext.kind === "delete_last") {
    return ask(`${ext.customer_name} naam ka customer nahi mila.`);
  } else if (ext.is_new_customer || confirm === "new_customer") {
    const [row] = await db
      .insert(customers)
      .values({ merchantId: merchant.id, name: ext.customer_name, trustLevel: "new" })
      .returning({ id: customers.id, name: customers.name });
    customer = row!;
    created = true;
  } else {
    return ask(`Naya customer ${ext.customer_name} banaun?`, [
      { label: "Haan, banao", text: transcript, confirm: "new_customer" },
      NO,
    ]);
  }

  // "…ka last entry hata do": confirm first (F1.2).
  if (ext.kind === "delete_last") {
    const last = await lastEntryFor(db, merchant.id, customer.id);
    if (!last) return ask(`${customer.name} ki koi entry nahi mili.`);
    const what = `${formatPaise(last.amountPaise)} ${last.type === "payment" ? "jama" : "udhaar"}`;
    return ask(`${customer.name} ki last entry ${what} hataun?`, [
      { label: "Haan, hatao", deleteEntryId: last.id },
      NO,
    ]);
  }

  if (amount === null) return ask(`${customer.name} ke liye kitne rupaye? Dobara poora boliye.`);
  const amountPaise = rupeesToPaise(amount);
  const type = ext.kind;

  if (confirm !== "duplicate" && (await recentDuplicate(db, merchant.id, customer.id, type, amountPaise))) {
    return ask("Yeh entry abhi daali thi, phir se jodun?", [
      { label: "Haan, phir se", text: transcript, confirm: "duplicate" },
      NO,
    ]);
  }

  const today = todayIst();
  const dueDate =
    type === "credit"
      ? (ext.due_phrase && resolveDate(ext.due_phrase, { direction: "future" })) ||
        addDays(today, merchant.defaultDueDays)
      : null;

  const [entry] = await db
    .insert(ledgerEntries)
    .values({
      merchantId: merchant.id,
      customerId: customer.id,
      type,
      amountPaise,
      items: ext.items,
      source: "voice",
      transcript,
      confidence: ext.confidence,
      entryDate: today,
      dueDate,
      createdBy: membership.userId,
    })
    .returning({ id: ledgerEntries.id });

  const balancePaise = await balanceOf(db, customer.id);
  const prefix = created ? `Naya customer ${customer.name} bana diya. ` : "";
  const after =
    balancePaise > 0
      ? `Ab kul ${formatPaise(balancePaise)} baaki.`
      : balancePaise === 0
        ? "Ab koi baaki nahi."
        : `${formatPaise(-balancePaise)} advance hai.`;
  const replyText =
    type === "credit"
      ? `${prefix}${customer.name} ke khate mein ${formatPaise(amountPaise)} udhaar jod diya. ${after}`
      : `${prefix}${customer.name} ne ${formatPaise(amountPaise)} jama kiye. ${after}`;

  return {
    replyText,
    entry: {
      id: entry!.id,
      customerId: customer.id,
      customerName: customer.name,
      type,
      amountPaise,
      balancePaise,
    },
    followUp: null,
  };
}
