import { redirect } from "next/navigation";
import { getMe } from "@/lib/api";
import { OnboardingFlow } from "./onboarding-flow";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const me = await getMe();
  if (me.merchant) redirect("/");
  return <OnboardingFlow />;
}
