/** Hinglish label with a mono English sub-label (CLAUDE.md §6 design rules). */
export function Label({ text, className = "" }: { text: readonly [string, string]; className?: string }) {
  return (
    <span className={className}>
      {text[0]}
      <span className="mono block text-[11px] font-medium opacity-70">{text[1]}</span>
    </span>
  );
}
