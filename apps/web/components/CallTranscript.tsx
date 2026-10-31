import type { CallTurn } from "@hisaab/shared";

export function CallTranscript({ turns, customerName }: { turns: CallTurn[]; customerName: string }) {
  return (
    <ol className="flex flex-col gap-2" aria-live="polite">
      {turns.map((turn, i) => (
        <li
          key={`${turn.at}-${i}`}
          className={`max-w-[85%] rounded-2xl px-3 py-2 ${
            turn.role === "agent" ? "self-start bg-neutral-100" : "self-end bg-neutral-900 text-white"
          }`}
        >
          <p className="text-xs font-semibold opacity-70">
            {turn.role === "agent" ? "Hisaab AI" : customerName}
          </p>
          <p className="text-lg">{turn.text}</p>
        </li>
      ))}
    </ol>
  );
}
