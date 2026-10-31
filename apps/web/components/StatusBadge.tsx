import type { DueStatus } from "@hisaab/shared";

// Status always in words + colour, never colour alone (§6). Square tags, never pills.
const STATUS: Record<DueStatus, { label: string; english: string; className: string }> = {
  overdue: { label: "Der ho gayi", english: "Overdue", className: "bg-red-100 text-red-800" },
  due: { label: "Baaki", english: "Due", className: "bg-amber-100 text-amber-900" },
  clear: { label: "Hisaab saaf", english: "Clear", className: "bg-green-100 text-green-800" },
  advance: { label: "Advance", english: "Paid ahead", className: "bg-sky-paper text-ledger-navy" },
};

const PREDICTION = {
  will_pay: "Dega · Will pay",
  might_delay: "Der kar sakta · Might delay",
  risky: "Risky",
} as const;

export function StatusBadge({ status }: { status: DueStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-block px-2 py-0.5 text-[13px] font-semibold ${s.className}`}>
      {s.label} <span className="font-normal opacity-75">· {s.english}</span>
    </span>
  );
}

export function PredictionLabel({ prediction }: { prediction: keyof typeof PREDICTION | null }) {
  if (!prediction) return null;
  return <span className="text-[13px] text-quiet-gray">{PREDICTION[prediction]}</span>;
}
