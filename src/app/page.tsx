import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (can(session.permissions, "dashboard.view")) redirect("/dashboard");
  redirect(session.user.employeeId ? `/employees/${session.user.employeeId}` : "/settings");
}
