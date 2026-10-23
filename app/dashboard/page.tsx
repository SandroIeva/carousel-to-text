import { redirect } from "next/navigation";
import { configured, identity, integrationsReady } from "@/lib/server";
import Dashboard from "@/components/dashboard";
import { usageDay } from "@/lib/daily-limit";
import { syncI7Plan } from "@/lib/i7os";
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
  const membership = await syncI7Plan(db, user);
  const [
    { data: jobs, error },
    { data: plan },
    { data: daily },
    { data: usage },
    { data: folders, error: foldersError },
  ] = await Promise.all([
    db
      .from("ctt_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("ctt_plans")
      .select("monthly_limit,quota_exempt,free_scrapes_used")
      .eq("user_id", user.id)
      .maybeSingle(),
    db
      .from("ctt_daily_usage")
      .select("used")
      .eq("user_id", user.id)
      .eq("day", usageDay())
      .maybeSingle(),
    db
      .from("ctt_usage")
      .select("used")
      .eq("user_id", user.id)
      .eq("month", new Date().toISOString().slice(0, 7) + "-01")
      .maybeSingle(),
    db
      .from("ctt_folders")
      .select("id,user_id,name,created_at")
      .order("created_at", { ascending: true }),
  ]);
  return (
    <Dashboard
      initial={jobs || []}
      initialFolders={folders || []}
      email={user.email || ""}
      avatarUrl={
        typeof user.user_metadata?.avatar_url === "string" &&
        user.user_metadata.avatar_url.startsWith("https://")
          ? user.user_metadata.avatar_url
          : ""
      }
      used={usage?.used || 0}
      dailyUsed={daily?.used || 0}
      freeScrapesUsed={plan?.free_scrapes_used || 0}
      dailyLimit={membership.plan === "free" ? 5 : membership.dailyLimit}
      i7Plan={membership.plan}
      rewriteLimit={membership.rewriteLimit}
      limit={plan?.monthly_limit ?? 30}
      quotaExempt={plan?.quota_exempt === true}
      ready={integrationsReady()}
      initialError={
        error || foldersError ? "Could not load your history. Please check database setup." : ""
      }
    />
  );
}
