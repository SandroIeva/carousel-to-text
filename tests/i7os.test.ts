import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import type { User } from "@supabase/supabase-js";
import { verifiedEmail, lookupI7Plan, I7_LIMITS } from "../lib/i7os";
test("i7OS matching requires verified exact email and validates server plan", async () => {
  assert.equal(
    verifiedEmail({
      email: "Someone+tag@Gmail.com",
      email_confirmed_at: "2026-10-12",
      is_anonymous: false,
    } as User),
    "someone+tag@gmail.com",
  );
  assert.equal(verifiedEmail({ email: "someone@example.com" } as User), null);
  assert.equal(
    verifiedEmail({
      email: "someone@example.com",
      email_confirmed_at: "2026-10-12",
      is_anonymous: true,
    } as User),
    null,
  );
  assert.deepEqual(I7_LIMITS, { free: 3, starter: 10, pro: 25, agency: 50 });
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "https://app.i7os.com/api/slidescrape-entitlements",
      );
      assert.equal(init?.redirect, "error");
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer session-token",
      );
      assert.equal(
        (init?.headers as Record<string, string>)["X-SlideScrape-Public-Key"],
        "public-key",
      );
      assert.equal(init?.body, "{}");
      return Response.json({ paid: true, plan: "pro" });
    };
    assert.equal(await lookupI7Plan("session-token", "public-key"), "pro");
    globalThis.fetch = async () => Response.json({ paid: false, plan: "free" });
    assert.equal(await lookupI7Plan("t", "k"), "free");
    globalThis.fetch = async () =>
      Response.json({ paid: true, plan: "unlimited" });
    await assert.rejects(() => lookupI7Plan("t", "k"), /Invalid/);
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    await assert.rejects(() => lookupI7Plan("t", "k"), /unavailable/);
  } finally {
    globalThis.fetch = original;
  }
});
test("paid quotas use trusted expiring plan and retain client write protection", async () => {
  const db = new PGlite();
  const user = "11111111-1111-4111-8111-111111111111",
    ip = "a".repeat(64);
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;insert into auth.users values('${user}');`,
    );
    await db.exec(readFileSync("schema.sql", "utf8"));
    await db.exec("set role service_role");
    await db.query(
      "insert into ctt_plans(user_id,monthly_limit,daily_limit,rewrite_limit,i7_plan,i7_valid_until) values($1,310,10,10,'starter',now()+interval '2 minutes')",
      [user],
    );
    await db.query(
      "insert into ctt_daily_usage(user_id,day,used) values($1,(now() at time zone 'Europe/Berlin')::date,9)",
      [user],
    );
    await db.query(
      "insert into ctt_ip_usage(ip_hash,day,used) values($1,(now() at time zone 'Europe/Berlin')::date,9)",
      [ip],
    );
    await db.query(
      "insert into ctt_usage(user_id,month,used) values($1,date_trunc('month',now() at time zone 'UTC')::date,31)",
      [user],
    );
    const reserve = () =>
      db.query<{ id: string }>("select ctt_reserve_job($1,$2,$3,$4) as id", [
        user,
        "https://www.instagram.com/p/abc/",
        crypto.randomUUID(),
        ip,
      ]);
    const id = (await reserve()).rows[0].id;
    await assert.rejects(reserve, /daily_user_quota/);
    await db.query("update ctt_jobs set status='completed' where id=$1", [id]);
    await db.query(
      "insert into ctt_rewrite_usage(bucket,day,used) values($1,(now() at time zone 'Europe/Berlin')::date,9),($2,(now() at time zone 'Europe/Berlin')::date,9)",
      ["user:" + user, "ip:" + ip],
    );
    const rewrite = () =>
      db.query("select ctt_claim_rewrite($1,$2,$3,$4)", [user, id, ip, ""]);
    await rewrite();
    await db.exec("update ctt_rewrites set status='ready',lease_until=null");
    await assert.rejects(rewrite, /rewrite_quota/);
    await db.exec(
      "update ctt_plans set i7_valid_until=now()-interval '1 second';update ctt_daily_usage set used=2;update ctt_ip_usage set used=2",
    );
    await assert.rejects(reserve, /quota/); // Expired paid monthly allowance reverts to 30.
    await db.exec("update ctt_usage set used=0,last_request=null");
    await reserve();
    await assert.rejects(reserve, /daily_user_quota/);
    await db.exec("set role authenticated");
    await assert.rejects(
      () => db.exec("update ctt_plans set daily_limit=50"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
