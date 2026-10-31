import { CallStateSchema } from "@hisaab/shared";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ApiFailure, apiFetch, requireShop } from "@/lib/api";
import { CallMonitor } from "./call-monitor";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  await requireShop();
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await apiFetch(`/calls/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiFailure && err.status === 404) notFound();
    throw err;
  }
  // The customer tab link uses whatever host the merchant opened (localhost or the demo tunnel).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <AppShell>
      <CallMonitor initial={CallStateSchema.parse(raw)} joinUrl={`${proto}://${host}/call-sim/${id}`} />
    </AppShell>
  );
}
