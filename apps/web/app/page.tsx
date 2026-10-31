import { formatPaise, TodaySummarySchema } from "@hisaab/shared";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Label } from "@/components/Label";
import { Landing } from "@/components/landing/Landing";
import { apiFetch, requireShop } from "@/lib/api";
import { auth } from "@/lib/auth/server";
import { PREVIEW } from "@/lib/preview";
import { t } from "@/lib/strings";

export const dynamic = "force-dynamic";

// Signed out → public landing page. Signed in → the shop's Home (onboarding if no shop yet).
export default async function Page() {
  const { data: session } = PREVIEW ? { data: { user: {} } } : await auth.getSession();
  if (!session?.user) return <Landing />;
  return <Home />;
}

function Row({ href, label }: { href: string; label: readonly [string, string] }) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center justify-between gap-3 border border-steel-rule bg-paper-white px-4 py-2 text-[17px] font-semibold"
    >
      <Label text={label} />
      <span aria-hidden className="text-xl leading-none">
        →
      </span>
    </Link>
  );
}

async function Home() {
  const { merchant } = await requireShop();
  const summary = TodaySummarySchema.parse(await apiFetch("/summary/today"));

  return (
    <AppShell>
      <p className="text-[15px] text-quiet-gray">{t.home.greeting(merchant.ownerName)}</p>
      <h1 className="text-[28px] leading-tight">{merchant.shopName}</h1>

      {/* The one number a shopkeeper opens the app for: how much is still owed. */}
      <section aria-label="Udhaar due" className="grid-field mt-5 p-5 text-paper-white">
        <p className="text-[15px] font-medium text-paper-white/85">
          {t.home.udhaarDue[0]} <span className="font-normal opacity-70">· {t.home.udhaarDue[1]}</span>
        </p>
        <p className="num mt-1 text-[44px] leading-none font-bold">{formatPaise(summary.udhaarDuePaise)}</p>
        {summary.overdueCustomers > 0 && (
          <p className="mt-3 inline-block bg-red-100 px-2 py-1 text-[13px] font-semibold text-red-800">
            {summary.overdueCustomers} customer der se · overdue
          </p>
        )}
        <Link
          href="/collect"
          className="mt-4 flex min-h-12 items-center justify-between border border-paper-white/50 px-4 text-[16px] font-semibold"
        >
          Wasooli shuru karein <span aria-hidden>→</span>
        </Link>
      </section>

      <section aria-label="Today" className="mt-3 grid grid-cols-2 border border-rule-gray">
        <div className="bg-mint-paper p-4">
          <p className="num text-[24px] leading-none font-bold">{formatPaise(summary.salesPaise)}</p>
          <Label text={t.home.todaySales} className="mt-2 block text-[14px] font-medium" />
        </div>
        <div className="border-l border-rule-gray bg-mint-paper p-4">
          <p className="num text-[24px] leading-none font-bold">{formatPaise(summary.collectedPaise)}</p>
          <Label text={t.home.collected} className="mt-2 block text-[14px] font-medium" />
        </div>
      </section>

      <div className="mt-5 flex flex-col gap-2">
        <Row href="/customers" label={["Khata dekhein", "Customers & dues"]} />
        <Row href="/credit" label={["Credit score dekhein", "Score & loan"]} />
        <Row href="/udhaar" label={["Paytm Udhaar", "Give credit, Paytm pays you"]} />
        <div
          aria-disabled
          className="flex min-h-16 items-center justify-between border border-dashed border-steel-rule px-4 py-2 text-[17px] font-semibold text-quiet-gray"
        >
          <Label text={t.home.scanKhata} />
          <span className="text-[13px] font-normal">{t.home.comingSoon[0]}</span>
        </div>
      </div>

      <p className="mt-8 text-center text-[15px] text-quiet-gray">
        Mic daba kar boliye
        <span className="mt-1 block text-[16px] text-ink-black">
          &ldquo;Gupta ji, do kilo chawal, 120 udhaar&rdquo;
        </span>
      </p>
    </AppShell>
  );
}
