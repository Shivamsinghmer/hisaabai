import { BottomNav } from "@/components/BottomNav";

/**
 * Mobile-first frame for in-app pages: content plus a bottom bar with the mic
 * button in the centre (§6: mic on every main screen).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-paper-white">
      <main className="flex-1 px-4 pt-5 pb-32">{children}</main>
      <BottomNav />
    </div>
  );
}
