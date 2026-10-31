import Link from "next/link";
import { t } from "@/lib/strings";

/**
 * Mobile-first frame for in-app pages: content plus a bottom bar with the mic
 * button in the centre (§6: mic on every main screen). The mic is wired up in
 * Phase 2 (voice layer).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      <main className="flex-1 px-4 pt-4 pb-28">{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md items-end justify-around border-t border-neutral-200 bg-white px-4 pt-2 pb-3"
      >
        <NavLink href="/" label={t.nav.home} />
        <button
          type="button"
          disabled
          aria-label={`${t.home.micHint[0]} (${t.home.micHint[1]}) — ${t.home.comingSoon[1]}`}
          className="-mt-8 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg disabled:opacity-60"
        >
          <MicIcon />
        </button>
        <NavLink href="/me" label={t.nav.account} />
      </nav>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: readonly [string, string] }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 min-w-16 flex-col items-center justify-center text-sm font-medium"
    >
      {label[0]}
    </Link>
  );
}

function MicIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" strokeLinecap="round" />
    </svg>
  );
}
