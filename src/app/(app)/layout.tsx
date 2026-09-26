import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SessionProvider } from "@/components/providers/session";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <SessionProvider session={{ user: session.user, permissions: session.permissions }}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
