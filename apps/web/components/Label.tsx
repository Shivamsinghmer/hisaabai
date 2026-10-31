/** Hinglish label with an English sub-label (CLAUDE.md §6 design rules). */
export function Label({ text, className = "" }: { text: readonly [string, string]; className?: string }) {
  return (
    <span className={className}>
      {text[0]}
      <span className="block text-sm font-normal opacity-70">{text[1]}</span>
    </span>
  );
}
