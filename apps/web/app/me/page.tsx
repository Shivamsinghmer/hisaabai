import { AppShell } from "@/components/AppShell";
import { requireShop } from "@/lib/api";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const { user, membership, merchant } = await requireShop();

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">Mera account</h1>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-lg">
        <dt className="text-neutral-600">Email</dt>
        <dd className="break-all">{user.email}</dd>
        <dt className="text-neutral-600">Dukaan</dt>
        <dd>{merchant.shopName}</dd>
        <dt className="text-neutral-600">Role</dt>
        <dd>{membership.role === "owner" ? "Maalik (Owner)" : "Helper"}</dd>
        <dt className="text-neutral-600">Bhasha</dt>
        <dd>{merchant.language}</dd>
      </dl>
      <SignOutButton />
    </AppShell>
  );
}
