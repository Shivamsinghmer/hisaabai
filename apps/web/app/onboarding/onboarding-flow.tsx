"use client";

import { LANGUAGES, type LanguageCode } from "@hisaab/shared";
import { useState, useTransition } from "react";
import { Label } from "@/components/Label";
import { t } from "@/lib/strings";
import { createShop } from "./actions";

// F0 after email sign-in: language → shop → consent → Home.
// With the sign-in screen that is 4 screens to Home.
type Step = 1 | 2 | 3;
const TOTAL = 3;

const button =
  "flex min-h-14 w-full items-center justify-center rounded-lg px-4 text-lg font-semibold disabled:opacity-50";
const primary = `${button} bg-neutral-900 text-white`;
const secondary = `${button} border-2 border-neutral-900`;
const input = "min-h-14 w-full rounded-lg border-2 border-neutral-300 px-3 text-lg focus:border-neutral-900";

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>(1);
  const [language, setLanguage] = useState<LanguageCode>("hi-IN");
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function finish() {
    setError(null);
    startTransition(async () => {
      const result = await createShop({
        shopName: shopName.trim(),
        ownerName: ownerName.trim(),
        language,
        city: city.trim() || undefined,
        acceptedConsent: true,
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <p className="text-sm font-medium text-neutral-600">{t.onboarding.stepOf(step, TOTAL)}</p>

      {step === 1 && (
        <section className="mt-2 flex flex-1 flex-col">
          <h1 className="text-2xl font-bold">
            <Label text={t.onboarding.language} />
          </h1>
          <div role="radiogroup" className="mt-4 grid grid-cols-2 gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={language === l.code}
                onClick={() => setLanguage(l.code)}
                className={`min-h-14 rounded-lg border-2 px-3 text-left text-lg ${
                  language === l.code ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"
                }`}
              >
                {l.label}
                <span className="block text-sm opacity-70">{l.english}</span>
              </button>
            ))}
          </div>
          <div className="mt-auto pt-6">
            <button type="button" className={primary} onClick={() => setStep(2)}>
              <Label text={t.onboarding.next} />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <form
          className="mt-2 flex flex-1 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setStep(3);
          }}
        >
          <h1 className="text-2xl font-bold">
            <Label text={t.onboarding.shop} />
          </h1>
          <Field label={t.onboarding.shopName}>
            <input
              className={input}
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              required
              maxLength={80}
              autoComplete="organization"
              placeholder="Sharma General Store"
            />
          </Field>
          <Field label={t.onboarding.ownerName}>
            <input
              className={input}
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              required
              maxLength={80}
              autoComplete="name"
              placeholder="Ramesh Sharma"
            />
          </Field>
          <Field label={t.onboarding.city}>
            <input
              className={input}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={60}
              autoComplete="address-level2"
              placeholder="Noida"
            />
          </Field>
          <div className="mt-auto flex flex-col gap-2 pt-6">
            <button type="submit" className={primary} disabled={!shopName.trim() || !ownerName.trim()}>
              <Label text={t.onboarding.next} />
            </button>
            <button type="button" className={secondary} onClick={() => setStep(1)}>
              <Label text={t.onboarding.back} />
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <section className="mt-2 flex flex-1 flex-col">
          <h1 className="text-2xl font-bold">
            <Label text={t.onboarding.consentTitle} />
          </h1>
          <ul className="mt-4 flex flex-col gap-3">
            {t.onboarding.consentPoints.map((point) => (
              <li key={point[1]} className="rounded-lg border border-neutral-200 p-3 text-lg">
                <Label text={point} />
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="mt-4 font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="mt-auto flex flex-col gap-2 pt-6">
            <button type="button" className={primary} onClick={finish} disabled={pending}>
              {pending ? "…" : <Label text={t.onboarding.accept} />}
            </button>
            <button type="button" className={secondary} onClick={() => setStep(2)} disabled={pending}>
              <Label text={t.onboarding.back} />
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function Field({ label, children }: { label: readonly [string, string]; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 font-semibold">
      <Label text={label} />
      {children}
    </label>
  );
}
