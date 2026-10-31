import Link from "next/link";
import { auth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data: session } = await auth.getSession();
  const user = session?.user;

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-3xl font-bold">Hisaab AI</h1>
      <p className="text-gray-600">Phase 0 skeleton</p>

      <section className="mt-6 rounded-lg border p-4">
        {user ? (
          <>
            <p>
              Logged in: <strong>{user.email}</strong>
            </p>
            <Link
              href="/me"
              className="mt-3 inline-flex min-h-12 items-center rounded bg-black px-4 text-white"
            >
              Mera hisaab <span className="ml-1 text-sm opacity-75">(My account)</span>
            </Link>
          </>
        ) : (
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-12 items-center rounded bg-black px-4 text-white"
          >
            Login karein <span className="ml-1 text-sm opacity-75">(Sign in)</span>
          </Link>
        )}
      </section>
    </main>
  );
}
