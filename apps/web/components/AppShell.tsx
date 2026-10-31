import Link from "next/link";
import { MicButton } from "@/components/MicButton";
import { t } from "@/lib/strings";

/**
 * Mobile-first frame for in-app pages: content plus a bottom bar with the mic
 * button in the centre (§6: mic on every main screen).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      <main className="flex-1 px-4 pt-4 pb-28">{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md items-end justify-around border-t border-rule-gray bg-paper-white px-4 pt-2 pb-3"
      >
        <NavLink href="/" label={t.nav.home} />
        <NavLink href="/customers" label={t.nav.khata} />
        <MicButton />
        <NavLink href="/collect" label={t.nav.collect} />
      </nav>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: readonly [string, string] }) {
  return (
    <Link
      href={href}
      className="mono flex min-h-12 min-w-16 flex-col items-center justify-center text-[12px]"
    >
      {label[0]}
    </Link>
  );
}
