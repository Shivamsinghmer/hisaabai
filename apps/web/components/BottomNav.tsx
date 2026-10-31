"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MicButton } from "@/components/MicButton";
import { t } from "@/lib/strings";

type Item = {
  href: string;
  label: readonly [string, string];
  match: (p: string) => boolean;
  icon: React.ReactNode;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ITEMS: Item[] = [
  {
    href: "/",
    label: t.nav.home,
    match: (p) => p === "/",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden {...stroke}>
        <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    href: "/customers",
    label: t.nav.khata,
    match: (p) => p.startsWith("/customers"),
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden {...stroke}>
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
        <path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" />
      </svg>
    ),
  },
  {
    href: "/collect",
    label: t.nav.collect,
    match: (p) => p.startsWith("/collect") || p.startsWith("/call"),
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden {...stroke}>
        <path d="M6 5h12M6 9h12M9 5c5 0 6 3 3 5.5S9 13 9 13l7 7" />
      </svg>
    ),
  },
  {
    href: "/credit",
    label: t.nav.credit,
    match: (p) => p.startsWith("/credit") || p.startsWith("/udhaar"),
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden {...stroke}>
        <path d="M4 20V9M10 20V4M16 20v-8M22 20H2" />
      </svg>
    ),
  },
];

/** Four destinations with the mic in the middle (§6: mic on every main screen). */
export function BottomNav() {
  const pathname = usePathname();
  const [home, khata, collect, credit] = ITEMS as [Item, Item, Item, Item];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-md grid-cols-5 items-end border-t border-rule-gray bg-paper-white pt-1.5 pb-2.5"
    >
      {[home, khata].map((item) => (
        <NavLink key={item.href} item={item} active={item.match(pathname)} />
      ))}
      <div className="flex justify-center">
        <MicButton />
      </div>
      {[collect, credit].map((item) => (
        <NavLink key={item.href} item={item} active={item.match(pathname)} />
      ))}
    </nav>
  );
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12.5px] font-medium ${
        active ? "text-ledger-navy" : "text-quiet-gray"
      }`}
    >
      <span className={`h-0.5 w-8 ${active ? "bg-registry-blue" : "bg-transparent"}`} aria-hidden />
      {item.icon}
      {item.label[0]}
    </Link>
  );
}
