import { notFound } from "next/navigation";
import { getPayInfo } from "@/app/public-actions";
import { PayForm } from "./pay-form";

export const dynamic = "force-dynamic";

// Mock Paytm UPI page (F2.1 step 4). Clearly marked demo; no real money moves.
export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await getPayInfo(token);
  if (!res.ok) notFound();
  return <PayForm token={token} info={res.data} />;
}
