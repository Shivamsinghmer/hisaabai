/** Hinglish label with a quiet English sub-label (CLAUDE.md §6 design rules). */
export function Label({ text, className = "" }: { text: readonly [string, string]; className?: string }) {
  return (
    <span className={className}>
      {text[0]}
      <span className="block text-[13px] leading-snug font-normal opacity-65">{text[1]}</span>
    </span>
  );
}
