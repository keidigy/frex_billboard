import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/components/Dashboard";
import { getCurrentUser } from "@/lib/auth";
import { countUsers } from "@/lib/db";
import { finalizeEndedLeagues } from "@/lib/leagues";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if ((await countUsers()).count === 0) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await finalizeEndedLeagues();

  return (
    <AppShell user={user}>
      <Dashboard user={user} />
    </AppShell>
  );
}
