import { redirect } from "next/navigation";
import { auth, getApiToken } from "@/lib/auth/server";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default async function MePage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  // Short-lived Neon Auth JWT, verified by the Fastify API against the branch JWKS.
  const { data: tokenData, error: tokenError } = await getApiToken();
  let api: unknown = null;
  let apiStatus: number | null = null;
  if (tokenData?.token) {
    const res = await fetch(`${API_URL}/me`, {
      headers: { authorization: `Bearer ${tokenData.token}` },
      cache: "no-store",
    });
    apiStatus = res.status;
    api = await res.json();
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-2xl font-bold">Mera account</h1>
      <p className="mt-2">
        Session user: <strong>{session.user.email}</strong>
      </p>
      <h2 className="mt-6 font-semibold">API /me (status {apiStatus ?? "—"})</h2>
      {tokenError && <p className="text-red-700">Token error: {tokenError.message}</p>}
      <pre className="mt-2 overflow-x-auto rounded bg-gray-100 p-3 text-sm">
        {JSON.stringify(api, null, 2)}
      </pre>
      <SignOutButton />
    </main>
  );
}
