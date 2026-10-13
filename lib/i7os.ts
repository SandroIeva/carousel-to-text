import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { admin } from "./server";
import { supabasePublicConfig } from "./supabase-config";
export const I7_LIMITS = { free: 3, starter: 10, pro: 25, agency: 50 } as const;
export type I7Plan = keyof typeof I7_LIMITS;
export function verifiedEmail(user: User) {
  return user.email_confirmed_at && !user.is_anonymous && user.email
    ? user.email.trim().toLowerCase()
    : null;
}
export async function lookupI7Plan(
  token: string,
  publicKey: string,
): Promise<I7Plan> {
  const base = new URL(process.env.I7OS_APP_URL || "https://app.i7os.com");
  if (base.protocol !== "https:" || base.username || base.password || base.port)
    throw new Error("Invalid i7OS endpoint configuration.");
  const response = await fetch(new URL("/api/slidescrape-entitlements", base), {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
    headers: {
      Authorization: `Bearer ${token}`,
      "X-SlideScrape-Public-Key": publicKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok)
    throw new Error("i7OS subscription verification unavailable.");
  const data = await response.json();
  if (data.paid === true && ["starter", "pro", "agency"].includes(data.plan))
    return data.plan as I7Plan;
  if (data.paid === false && data.plan === "free") return "free";
  throw new Error("Invalid i7OS entitlement response.");
}
export async function syncI7Plan(db: SupabaseClient, user: User) {
  const server = admin();
  const email = verifiedEmail(user);
  const { data: current, error } = await server
    .from("ctt_plans")
    .select(
      "quota_exempt,i7_plan,i7_email,i7_checked_at,i7_valid_until,daily_limit,rewrite_limit",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (
    email &&
    current?.i7_email === email &&
    Date.parse(current.i7_checked_at || "") > Date.now() - 60000 &&
    Date.parse(current.i7_valid_until || "") > Date.now()
  )
    return {
      plan: current.i7_plan as I7Plan,
      dailyLimit: current.i7_plan === "free" ? 5 : current.daily_limit,
      rewriteLimit: current.rewrite_limit,
    };
  let plan: I7Plan = "free";
  let available = true;
  if (email) {
    try {
      const { data, error: sessionError } = await db.auth.getSession();
      if (sessionError || !data.session?.access_token) throw new Error();
      const key = supabasePublicConfig().key;
      if (!key) throw new Error();
      plan = await lookupI7Plan(data.session.access_token, key);
    } catch {
      available = false;
    }
  }
  const limit = I7_LIMITS[plan];
  const { error: savedError } = await server.from("ctt_plans").upsert(
    {
      user_id: user.id,
      monthly_limit: plan === "free" ? 30 : limit * 31,
      daily_limit: limit,
      rewrite_limit: limit,
      i7_plan: plan,
      i7_email: email,
      i7_checked_at: new Date().toISOString(),
      i7_valid_until: new Date(Date.now() + 120000).toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (savedError) throw savedError;
  return {
    plan,
    dailyLimit: plan === "free" ? 5 : limit,
    rewriteLimit: limit,
    available,
  };
}
