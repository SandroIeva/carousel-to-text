import { redirect } from "next/navigation";
import { configured, identity, integrationsReady } from "@/lib/server";
import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!configured()) redirect("/login");
  let account;
  try {
    account = await identity();
  } catch {
    redirect("/login");
  }
  const { db, user } = account;
  const [{ data: jobs, error }, { data: plan }, { data: usage }] =
    await Promise.all([
      db
        .from("ctt_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("ctt_plans")
        .select("monthly_limit")
        .eq("user_id", user.id)
        .maybeSingle(),
      db
        .from("ctt_usage")
        .select("used")
        .eq("user_id", user.id)
        .eq("month", new Date().toISOString().slice(0, 7) + "-01")
        .maybeSingle(),
    ]);
  return (
    <Dashboard
      initial={jobs || []}
      email={user.email || ""}
      used={usage?.used || 0}
      limit={plan?.monthly_limit ?? 30}
      ready={integrationsReady()}
      initialError={
        error
          ? "Verlauf konnte nicht geladen werden. Datenbank-Einrichtung prüfen."
          : ""
      }
    />
  );
}
