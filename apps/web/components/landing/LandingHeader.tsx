"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#credit", label: "Credit" },
  { href: "#principles", label: "Principles" },
];

/** Dark Desktop Header on the hero, Light Sticky Header once the white content field starts. */
export function LandingHeader() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const onScroll = () => setLight(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 border-b transition-colors ${
        light
          ? "border-rule-gray bg-paper-white text-ink-black"
          : "border-paper-white/20 bg-ledger-navy text-paper-white"
      }`}
    >
      <div className="mx-auto flex h-20 max-w-[1312px] items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Hisaab AI home">
          <span
            className={`mono flex h-8 w-8 items-center justify-center rounded text-sm ${
              light ? "bg-registry-blue text-paper-white" : "bg-paper-white text-ledger-navy"
            }`}
            aria-hidden
          >
            H
          </span>
          <span className="text-[18px] font-medium tracking-tight">Hisaab AI</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-[15px] font-medium">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/auth/sign-in"
            className={`mono hidden min-h-12 items-center rounded border px-5 text-[14px] sm:flex ${
              light ? "border-steel-rule text-ink-black" : "border-paper-white text-paper-white"
            }`}
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-in"
            className={`mono flex min-h-12 items-center rounded px-5 text-[14px] ${
              light
                ? "bg-ledger-navy text-paper-white"
                : "border border-paper-white bg-ledger-navy text-paper-white"
            }`}
          >
            Open app
          </Link>
        </div>
      </div>
    </header>
  );
}
