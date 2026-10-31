import { notFound } from "next/navigation";
import { getPublicCall } from "@/app/public-actions";
import { CustomerCall } from "./customer-call";

export const dynamic = "force-dynamic";

// The customer's phone in the call simulation (F2.2): no login, the call id is the key.
export default async function CallSimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getPublicCall(id);
  if (!res.ok) notFound();
  return <CustomerCall initial={res.data} />;
}
