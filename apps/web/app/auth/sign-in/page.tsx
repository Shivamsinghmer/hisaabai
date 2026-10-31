"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

// Email + password, with a 6-digit emailed code to verify a new account (Neon Auth,
// method otp). Signing in with an unverified email sends a fresh code. "Password bhool
// gaye?" emails a code that sets a new password.
type Step = "sign-in" | "sign-up" | "verify" | "forgot" | "reset";

type AuthResult = { error?: { code?: string; message?: string } | null };

/** The auth client sometimes returns { error } and sometimes throws (e.g. a wrong password). */
async function safe(fn: () => Promise<AuthResult>): Promise<AuthResult> {
  try {
    return await fn();
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { error: { code: e.code, message: e.message } };
  }
}

function friendly(error: NonNullable<AuthResult["error"]>): string {
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (text.includes("invalid email or password") || text.includes("invalid_email_or_password")) {
    return "Email ya password galat hai. Password bhool gaye? neeche dabayein. (Wrong email or password)";
  }
  if (text.includes("too_many") || text.includes("too many")) {
    return "Bahut baar koshish ki. Thodi der baad dobara try karein. (Too many attempts)";
  }
  if (text.includes("already") || text.includes("exists")) {
    return "Is email se account pehle se hai. Login karein. (Account already exists)";
  }
  return error.message ?? "Kuch galat ho gaya (Something went wrong)";
}

const field =
  "min-h-12 w-full border-2 border-steel-rule bg-paper-white px-3 text-[17px] focus:border-ledger-navy";
const primary =
  "min-h-12 w-full bg-ledger-navy text-[16px] font-semibold text-paper-white disabled:opacity-50";
const quiet = "min-h-12 text-left text-[15px] font-medium underline underline-offset-4";

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("sign-in");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Home sends users without a shop to onboarding.
  function done() {
    router.push("/");
    router.refresh();
  }

  function go(next: Step) {
    setError(null);
    setNotice(null);
    setStep(next);
  }

  async function sendVerification(to: string) {
    const res = await safe(() =>
      authClient.emailOtp.sendVerificationOtp({ email: to, type: "email-verification" }),
    );
    if (res.error) setError(friendly(res.error));
    return !res.error;
  }

  async function onCredentials(form: FormData) {
    setPending(true);
    setError(null);
    const formEmail = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));
    setEmail(formEmail);

    const result =
      step === "sign-up"
        ? await safe(() =>
            authClient.signUp.email({
              email: formEmail,
              password,
              name: String(form.get("name") || formEmail),
            }),
          )
        : await safe(() => authClient.signIn.email({ email: formEmail, password }));

    const needsCode = (step === "sign-up" && !result.error) || result.error?.code === "EMAIL_NOT_VERIFIED";
    if (needsCode) {
      const sent = await sendVerification(formEmail);
      setPending(false);
      if (sent) {
        setNotice(
          step === "sign-up"
            ? `Code bheja gaya: ${formEmail} (We emailed you a 6-digit code)`
            : `Email verify nahi hua. Naya code bheja: ${formEmail}`,
        );
      }
      setStep("verify");
      return;
    }
    setPending(false);
    if (result.error) return setError(friendly(result.error));
    done();
  }

  async function onVerify(form: FormData) {
    setPending(true);
    setError(null);
    const res = await safe(() =>
      authClient.emailOtp.verifyEmail({ email, otp: String(form.get("otp")).trim() }),
    );
    setPending(false);
    if (res.error) {
      return setError(
        res.error.code === "TOO_MANY_ATTEMPTS"
          ? "Bahut baar galat code. Naya code mangaiye. (Too many attempts)"
          : "Code galat hai ya expire ho gaya. (Wrong or expired code)",
      );
    }
    done();
  }

  async function onForgot(form: FormData) {
    setPending(true);
    setError(null);
    const to = String(form.get("email")).trim().toLowerCase();
    setEmail(to);
    const res = await safe(() => authClient.forgetPassword.emailOtp({ email: to }));
    setPending(false);
    if (res.error) return setError(friendly(res.error));
    setNotice(`Code bheja gaya: ${to}. Inbox ya spam dekhein. (Check your email)`);
    setStep("reset");
  }

  async function onReset(form: FormData) {
    setPending(true);
    setError(null);
    const otp = String(form.get("otp")).trim();
    const password = String(form.get("password"));
    const res = await safe(() => authClient.emailOtp.resetPassword({ email, otp, password }));
    if (res.error) {
      setPending(false);
      return setError("Code galat hai ya expire ho gaya. (Wrong or expired code)");
    }
    // New password set: sign straight in.
    const signedIn = await safe(() => authClient.signIn.email({ email, password }));
    setPending(false);
    if (signedIn.error) {
      setNotice("Password badal gaya. Ab login karein. (Password changed, please sign in)");
      return setStep("sign-in");
    }
    done();
  }

  const titles: Record<Step, [string, string]> = {
    "sign-in": ["Login", "Sign in"],
    "sign-up": ["Naya account", "Create account"],
    verify: ["Email code daalein", "Enter the emailed code"],
    forgot: ["Password bhool gaye?", "Reset your password"],
    reset: ["Naya password", "Set a new password"],
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <Link href="/" className="flex items-center gap-3" aria-label="Hisaab AI home">
        <span
          className="mono flex h-8 w-8 items-center justify-center rounded bg-ledger-navy text-sm text-paper-white"
          aria-hidden
        >
          H
        </span>
        <span className="text-[18px] font-semibold tracking-tight">Hisaab AI</span>
      </Link>

      <h1 className="mt-10 text-[30px] leading-tight">
        {titles[step][0]}
        <span className="block text-[15px] font-normal text-quiet-gray">{titles[step][1]}</span>
      </h1>
      {notice && <p className="mt-3 text-[15px] text-quiet-gray">{notice}</p>}

      {(step === "sign-in" || step === "sign-up") && (
        <form action={onCredentials} className="mt-6 flex flex-col gap-3">
          {step === "sign-up" && (
            <input name="name" placeholder="Naam (Name)" autoComplete="name" className={field} />
          )}
          <input
            name="email"
            type="email"
            required
            defaultValue={email}
            placeholder="Email"
            autoComplete="email"
            className={field}
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password (min 8)"
            autoComplete={step === "sign-up" ? "new-password" : "current-password"}
            className={field}
          />
          <ErrorNote message={error} />
          <button disabled={pending} className={primary}>
            {pending ? "…" : step === "sign-up" ? "Sign up" : "Login"}
          </button>
          {step === "sign-in" && (
            <button type="button" onClick={() => go("forgot")} className={quiet}>
              Password bhool gaye? <span className="font-normal text-quiet-gray">Forgot password</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => go(step === "sign-up" ? "sign-in" : "sign-up")}
            className={quiet}
          >
            {step === "sign-up" ? "Pehle se account hai? Login" : "Naya account banayein · Sign up"}
          </button>
        </form>
      )}

      {step === "verify" && (
        <form action={onVerify} className="mt-6 flex flex-col gap-3">
          <input
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="6-digit code"
            className={`${field} text-center text-2xl tracking-widest`}
          />
          <ErrorNote message={error} />
          <button disabled={pending} className={primary}>
            {pending ? "…" : "Verify karein"}
          </button>
          <button
            type="button"
            className={quiet}
            onClick={async () => {
              setError(null);
              if (await sendVerification(email)) setNotice(`Naya code bheja: ${email}`);
            }}
          >
            Code dobara bhejein · Resend code
          </button>
        </form>
      )}

      {step === "forgot" && (
        <form action={onForgot} className="mt-6 flex flex-col gap-3">
          <input
            name="email"
            type="email"
            required
            defaultValue={email}
            placeholder="Email"
            autoComplete="email"
            className={field}
          />
          <ErrorNote message={error} />
          <button disabled={pending} className={primary}>
            {pending ? "…" : "Code bhejein · Send code"}
          </button>
          <button type="button" onClick={() => go("sign-in")} className={quiet}>
            ← Login par wapas
          </button>
        </form>
      )}

      {step === "reset" && (
        <form action={onReset} className="mt-6 flex flex-col gap-3">
          <input
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="6-digit code"
            className={`${field} text-center text-2xl tracking-widest`}
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Naya password (min 8)"
            autoComplete="new-password"
            className={field}
          />
          <ErrorNote message={error} />
          <button disabled={pending} className={primary}>
            {pending ? "…" : "Password badlein · Set password"}
          </button>
          <button type="button" onClick={() => go("forgot")} className={quiet}>
            Code dobara bhejein · Resend code
          </button>
        </form>
      )}
    </main>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="border-l-4 border-red-700 bg-red-50 px-3 py-2 text-[15px] font-medium text-red-800"
    >
      {message}
    </p>
  );
}
