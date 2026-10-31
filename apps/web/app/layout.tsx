import type { Metadata, Viewport } from "next";
import { DM_Sans, IBM_Plex_Mono, Instrument_Serif, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

// Display serif for the landing page only: Instrument Serif has proper lining numerals
// (Cormorant, the design.md substitute, drew old-style digits that made rupee amounts hard to read).
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif-display",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-plex-mono",
  display: "swap",
});
// Hindi and other Devanagari labels fall back to this.
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500"],
  variable: "--font-deva",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hisaab AI — the khata that listens",
  description:
    "Voice-first AI business partner for kirana shops: speak udhaar entries, collect by AI call, and turn the ledger into an explainable credit score.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09234f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="hi"
      className={`${serif.variable} ${dmSans.variable} ${plexMono.variable} ${devanagari.variable}`}
    >
      <body className="min-h-screen bg-paper-white text-ink-black antialiased">{children}</body>
    </html>
  );
}
