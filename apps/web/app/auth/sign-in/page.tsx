"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

// Sign-up sends a 6-digit code to the user's email; entering it verifies the
// email and signs them in. Signing in with an unverified email sends a fresh
// code and shows the same step. We request the code explicitly: Neon's
// "send verification email on sign-up" setting did not send an OTP in testing.
type Step = "sign-in" | "sign-up" | "verify";

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

  async function onCredentials(form: FormData) {
    setPending(true);
    setError(null);
    const formEmail = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));
    setEmail(formEmail);

    const result =
      step === "sign-up"
        ? await authClient.signUp.email({
            email: formEmail,
            password,
            name: String(form.get("name") || formEmail),
          })
        : await authClient.signIn.email({ email: formEmail, password });

    const needsCode = (step === "sign-up" && !result.error) || result.error?.code === "EMAIL_NOT_VERIFIED";
    if (needsCode) {
      const sent = await sendCode(formEmail);
      setPending(false);
      setStep("verify");
      if (sent) {
        setNotice(
          step === "sign-up"
            ? `Code bheja gaya: ${formEmail} (We emailed you a 6-digit code)`
            : `Email verify nahi hua. Naya code bheja: ${formEmail} (Check your email for a new code)`,
        );
      }
      return;
    }
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Kuch galat ho gaya (Something went wrong)");
      return;
    }
    done();
  }

  async function onVerify(form: FormData) {
    setPending(true);
    setError(null);
    const { error: verifyError } = await authClient.emailOtp.verifyEmail({
      email,
      otp: String(form.get("otp")).trim(),
    });
    setPending(false);
    if (verifyError) {
      setError(
        verifyError.code === "TOO_MANY_ATTEMPTS"
          ? "Bahut baar galat code. Naya code mangaiye (Too many attempts, request a new code)"
          : "Code galat hai ya expire ho gaya (Wrong or expired code)",
      );
      return;
    }
    done();
  }

  async function sendCode(to: string): Promise<boolean> {
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email: to,
      type: "email-verification",
    });
    if (sendError) {
      setError(sendError.message ?? "Code nahi bhej paye (Could not send code)");
      return false;
    }
    return true;
  }

  async function resend() {
    setError(null);
    if (await sendCode(email)) setNotice(`Naya code bheja: ${email} (New code sent)`);
  }

  if (step === "verify") {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="text-2xl font-bold">
          Email code daalein{" "}
          <span className="block text-base font-normal text-gray-600">Enter email code</span>
        </h1>
        {notice && <p className="mt-2 text-gray-700">{notice}</p>}
        <form action={onVerify} className="mt-4 flex flex-col gap-3">
          <input
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="6-digit code"
            className="min-h-12 rounded border px-3 text-center text-2xl tracking-widest"
          />
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={pending}
            className="mono min-h-12 rounded bg-ledger-navy text-[14px] text-white disabled:opacity-50"
          >
            {pending ? "..." : "Verify karein (Verify)"}
          </button>
        </form>
        <button type="button" onClick={resend} className="mt-4 min-h-12 underline">
          Code dobara bhejein (Resend code)
        </button>
      </main>
    );
  }

  const isSignUp = step === "sign-up";
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-2xl font-bold">{isSignUp ? "Naya account (Sign up)" : "Login"}</h1>
      <form action={onCredentials} className="mt-4 flex flex-col gap-3">
        {isSignUp && <input name="name" placeholder="Naam (Name)" className="min-h-12 rounded border px-3" />}
        <input
          name="email"
          type="email"
          required
          defaultValue={email}
          placeholder="Email"
          className="min-h-12 rounded border px-3"
        />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8)"
          className="min-h-12 rounded border px-3"
        />
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <button
          disabled={pending}
          className="mono min-h-12 rounded bg-ledger-navy text-[14px] text-white disabled:opacity-50"
        >
          {pending ? "..." : isSignUp ? "Sign up" : "Login"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setStep(isSignUp ? "sign-in" : "sign-up");
        }}
        className="mt-4 min-h-12 underline"
      >
        {isSignUp ? "Pehle se account hai? (Sign in)" : "Naya account banayein (Sign up)"}
      </button>
    </main>
  );
}
