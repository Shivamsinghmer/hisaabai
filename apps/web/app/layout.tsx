import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hisaab AI",
  description: "Voice-first business partner for kirana shops",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
