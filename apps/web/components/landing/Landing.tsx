import Link from "next/link";
import { LandingHeader } from "./LandingHeader";

// Public landing page (signed-out "/"). Design: design.md (Baselayer-style system).
// Every figure is either from the product spec (market sizes) or from the seeded demo shop,
// and is labelled as such. Nothing here claims a feature that isn't built.

const wrap = "mx-auto w-full max-w-[1312px] px-5 md:px-8";
const eyebrow = "mono text-[12px] leading-[1.15]";
const link = "mono inline-block text-[16px] underline underline-offset-4 decoration-1";

export function Landing() {
  return (
    <div className="bg-paper-white text-ink-black">
      <LandingHeader />
      <Hero />
      <Statement />
      <Markets />
      <Capabilities />
      <ScoreTrio />
      <Principles />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="grid-field overflow-hidden pt-20 text-paper-white">
      <Marks />
      <div className={`${wrap} relative pt-16 pb-0 text-center md:pt-24`}>
        <p className={`${eyebrow} text-sky-paper`}>
          Voice-first udhaar ledger · Paytm Build for India · Track 1
        </p>
        <h1 className="font-display font-display-light mx-auto mt-6 max-w-4xl text-[40px] leading-[1.04] md:text-[72px] md:leading-[1.02]">
          The shopkeeper never types.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-[1.4] text-paper-white/85 md:text-[20px]">
          Speak a khata entry in Hindi or Hinglish. Collect with a polite AI call. Turn the ledger into a
          credit score the shopkeeper can understand.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/auth/sign-in"
            className="mono flex min-h-14 items-center rounded border border-paper-white bg-ledger-navy px-5 text-[16px] text-paper-white"
          >
            Open the app →
          </Link>
          <a
            href="#product"
            className="mono hidden min-h-14 items-center rounded border border-paper-white/40 px-5 text-[16px] sm:flex"
          >
            See how it works
          </a>
        </div>

        {/* Verification console: Registry Blue field, white inset rows, Sky Paper outline. */}
        <div className="mx-auto mt-16 max-w-3xl translate-y-[1px] text-left">
          <div className="border border-sky-paper bg-registry-blue p-5">
            <div className="mono flex items-center justify-between text-[12px] text-paper-white">
              <span>Ledger · Sharma General Store</span>
              <span className="text-sky-paper">Demo data</span>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <ConsoleRow
                label="Voice entry"
                name="“Gupta ji, do kilo chawal, 120 udhaar”"
                value="+₹120"
                status="Saved · balance ₹450"
              />
              <ConsoleRow label="Overdue" name="Gupta ji" value="₹450" status="Reminder + AI call ready" />
              <ConsoleRow
                label="Promise"
                name="“Friday ko dunga”"
                value="Fri 6 Nov"
                status="Follow-up scheduled"
              />
              <ConsoleRow
                label="Credit"
                name="Score 728 · offer ₹50,000"
                value="6 mo"
                status="Teach-back passed"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConsoleRow({
  label,
  name,
  value,
  status,
}: {
  label: string;
  name: string;
  value: string;
  status: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-y-1 bg-paper-white p-3 text-ink-black md:grid-cols-[110px_1fr_auto_220px] md:items-center md:gap-x-4">
      <span className="mono text-[12px] text-registry-blue">{label}</span>
      <span className="text-[15px] leading-[1.3] font-medium">{name}</span>
      {/* Stacked on a phone, four columns on desktop. */}
      <div className="flex items-baseline justify-between gap-3 md:contents">
        <span className="font-display text-[22px] leading-none whitespace-nowrap tabular-nums">{value}</span>
        <span className="mono text-[12px] text-quiet-gray md:text-right">{status}</span>
      </div>
    </div>
  );
}

/** Isolated plus-sign registration marks over the dark field. */
function Marks() {
  const spots = [
    "left-[6%] top-[28%]",
    "right-[8%] top-[22%]",
    "left-[14%] bottom-[22%]",
    "right-[16%] bottom-[30%]",
  ];
  return (
    <>
      {spots.map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={`plus absolute hidden md:block ${pos} text-xl text-paper-white/70`}
        />
      ))}
    </>
  );
}

function Statement() {
  return (
    <section id="product" className="border-b border-rule-gray pt-32 pb-20 text-center md:pt-48">
      <div className={wrap}>
        <h2 className="font-display font-display-light mx-auto max-w-4xl text-[36px] leading-[1.1] md:text-[48px] md:leading-[1.1]">
          India&rsquo;s udhaar lives in notebooks. Banks can&rsquo;t lend against a notebook.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-[1.4] text-quiet-gray md:text-[20px]">
          Hisaab AI keeps the khata for the shopkeeper, by voice, and turns it into collections today and
          credit tomorrow.
        </p>
        <div className="mt-6">
          <Link href="/auth/sign-in" className={link}>
            Try voice entry
          </Link>
        </div>
      </div>
    </section>
  );
}

function Markets() {
  const tiles = [
    { label: "Kirana stores in India", value: "12–13M", note: "most keep credit in a notebook" },
    { label: "MSME credit gap", value: "₹30 lakh crore", note: "about 24% of demand · SIDBI, May 2025" },
    { label: "Typing needed", value: "Zero", note: "mic or camera for every main action" },
  ];
  return (
    <section className="border-b border-rule-gray">
      <div className={`${wrap} grid grid-cols-1 md:grid-cols-3`}>
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className={`border-rule-gray p-5 py-10 ${i % 2 === 0 ? "bg-mint-paper" : "bg-paper-white"} ${
              i > 0 ? "md:border-l" : ""
            } border-t first:border-t-0 md:border-t-0`}
          >
            <p className={`${eyebrow} text-quiet-gray`}>{t.label}</p>
            <p className="font-display mt-3 text-[44px] leading-none md:text-[56px]">{t.value}</p>
            <p className="mt-3 text-[15px] text-quiet-gray">{t.note}</p>
          </div>
        ))}
      </div>
      <div className={`${wrap} flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-rule-gray py-6`}>
        <span className={`${eyebrow} text-quiet-gray`}>Runs on</span>
        {["Sarvam AI", "Groq", "Neon", "Upstash", "Next.js"].map((n) => (
          <span key={n} className="mono text-[14px]">
            {n}
          </span>
        ))}
      </div>
    </section>
  );
}

function Capabilities() {
  const panels = [
    {
      tag: "01 · Capture",
      title: "Speak the entry.",
      body: "Hold the mic and say “Gupta ji, do kilo chawal, 120 udhaar”. It understands ek sau bees, dhai sau and “Friday tak”, asks back when unsure, and keeps an Undo for 10 seconds.",
      cta: "Try voice entry →",
      className: "bg-network-teal text-paper-white",
    },
    {
      tag: "02 · Collect",
      title: "Collect without the awkward ask.",
      body: "Gentle reminders with a Paytm UPI link, and an AI call that says “Aapka ₹450 baaki hai”. “Friday ko dunga” becomes a promise and a follow-up, never a threat.",
      cta: "See collections →",
      className: "bg-sky-paper text-ink-black",
    },
    {
      tag: "03 · Credit",
      title: "A score you can explain.",
      body: "A 300–900 score from seven published factors, spoken back in simple Hindi, then a loan offer the borrower must repeat back (teach-back) before accepting.",
      cta: "See the score →",
      className: "bg-ledger-navy text-paper-white",
    },
  ];
  return (
    <section>
      {panels.map((p) => (
        <Link key={p.tag} href="/auth/sign-in" className={`block border-b border-rule-gray ${p.className}`}>
          <div className={`${wrap} grid gap-6 py-14 md:grid-cols-[220px_1fr_1fr] md:py-20`}>
            <p className={eyebrow}>{p.tag}</p>
            <h3 className="font-display font-display-light text-[36px] leading-[1.1] md:text-[48px]">
              {p.title}
            </h3>
            <div>
              <p className="text-[18px] leading-[1.4] md:text-[20px]">{p.body}</p>
              <p className="mono mt-6 text-[16px] underline underline-offset-4">{p.cta}</p>
            </div>
          </div>
        </Link>
      ))}
      <div className="bg-carbon text-paper-white">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-3 py-8`}>
          <p className={eyebrow}>Next · On the roadmap</p>
          <p className="text-[18px]">
            Photograph the old khata · Udhaar-as-a-Service · Stock and GST helpers
          </p>
        </div>
      </div>
    </section>
  );
}

function ScoreTrio() {
  const factors = [
    ["Udhaar recovery", "90%"],
    ["Digital share (UPI)", "60%"],
    ["Avg. days to recover", "11.8"],
    ["Promises kept", "54%"],
  ];
  return (
    <section id="credit" className="border-b border-rule-gray py-20 md:py-28">
      <div className={wrap}>
        <div className="mx-auto max-w-3xl text-center">
          <p className={`${eyebrow} text-registry-blue`}>Explainable credit</p>
          <h2 className="font-display font-display-light mt-4 text-[36px] leading-[1.1] md:text-[48px]">
            Every point has a reason.
          </h2>
          <p className="mt-4 text-[18px] text-quiet-gray md:text-[20px]">
            Seeded demo shop, computed live by the same scorecard the app uses.
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl gap-3 md:grid-cols-3">
          <div className="border border-steel-rule bg-carbon p-5 text-paper-white">
            <p className={`${eyebrow} text-sky-paper`}>Sharma General Store · Demo</p>
            <p className="font-display mt-6 text-[88px] leading-none">728</p>
            <p className="mt-2 text-[15px] text-paper-white/80">Credit score · scale 300–900</p>
          </div>
          <div className="border border-steel-rule bg-paper-white p-5">
            <p className={`${eyebrow} text-registry-blue`}>Why 728</p>
            <ul className="mt-4 divide-y divide-rule-gray">
              {factors.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between py-3 text-[15px]">
                  <span>{k}</span>
                  <span className="mono text-[14px]">{v}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-steel-rule bg-paper-white p-5">
            <p className={`${eyebrow} text-registry-blue`}>Offer · Mock lender rules</p>
            <p className="font-display mt-4 text-[44px] leading-none">₹50,000</p>
            <ul className="mt-4 divide-y divide-rule-gray text-[15px]">
              <li className="flex justify-between py-3">
                <span>Tenure</span>
                <span className="mono text-[14px]">6 months</span>
              </li>
              <li className="flex justify-between py-3">
                <span>Rate</span>
                <span className="mono text-[14px]">21% p.a.</span>
              </li>
              <li className="flex justify-between py-3">
                <span>EMI</span>
                <span className="mono text-[14px]">₹8,851 / month</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Principles() {
  const items = [
    [
      "Polite, never threatening",
      "Collections protect the relationship: quiet hours, one reminder a day, disputes pause everything.",
    ],
    [
      "Merchant approves",
      "AI suggests; the shopkeeper confirms tone, entries and every loan. Nothing financial happens silently.",
    ],
    [
      "Consent first",
      "Lending data is shared only after explicit, revocable consent. Every shop sees only its own data.",
    ],
  ];
  return (
    <section id="principles" className="border-b border-rule-gray">
      <div className={`${wrap} grid md:grid-cols-3`}>
        {items.map(([title, body], i) => (
          <div
            key={title}
            className={`border-rule-gray py-10 md:px-8 ${i > 0 ? "border-t md:border-t-0 md:border-l" : "md:pl-0"}`}
          >
            <p className={`${eyebrow} text-quiet-gray`}>0{i + 1}</p>
            <h3 className="mt-3 text-[24px] font-medium leading-[1.35] font-sans">{title}</h3>
            <p className="mt-3 text-[16px] leading-[1.5] text-quiet-gray">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="grid-field text-paper-white">
      <Marks />
      <div className={`${wrap} relative py-16 md:py-24`}>
        <h2 className="font-display font-display-light max-w-3xl text-[36px] leading-[1.1] md:text-[56px] md:leading-[1.02]">
          Turn the khata into collections today and credit tomorrow.
        </h2>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/auth/sign-in"
            className="mono flex min-h-14 items-center rounded border border-paper-white px-5 text-[16px]"
          >
            Open the app →
          </Link>
        </div>
        <div className="mt-16 flex flex-col gap-2 border-t border-paper-white/20 pt-6 md:flex-row md:justify-between">
          <p className={eyebrow}>Hisaab AI · Team BRX Devs · Paytm Build for India AI Hackathon, Track 1</p>
          <p className={`${eyebrow} text-paper-white/70`}>
            Prototype · scores, offers and payments are demo or mock
          </p>
        </div>
      </div>
    </footer>
  );
}
