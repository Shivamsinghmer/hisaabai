import { AppShell } from "@/components/AppShell";
import { CreditOffer } from "@/components/CreditOffer";
import { requireShop } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function LoanOfferPage() {
  await requireShop();
  return (
    <AppShell>
      <h1 className="text-2xl font-bold">
        Loan offer <span className="text-base font-normal text-neutral-600">(Anumati ke baad)</span>
      </h1>
      <div className="mt-5">
        <CreditOffer initialScore={null} />
      </div>
    </AppShell>
  );
}
