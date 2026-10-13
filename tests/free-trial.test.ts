import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
test("five lifetime free reservations survive job deletion and reject the sixth without creating a job", async () => {
  const db = new PGlite();
  const user = "11111111-1111-4111-8111-111111111111";
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to anon,authenticated,service_role;insert into auth.users values('${user}');`,
    );
    await db.exec(readFileSync("schema.sql", "utf8"));
    await db.exec(
      readFileSync(
        "supabase/migrations/20261013191802_free_trial_five_scrapes.sql",
        "utf8",
      ),
    );
    await db.exec("set role service_role");
    const reserve = () =>
      db.query("select ctt_reserve_job($1,$2,$3,$4)", [
        user,
        "https://www.instagram.com/p/abc/",
        crypto.randomUUID(),
        "a".repeat(64),
      ]);
    for (let i = 0; i < 5; i++) {
      await reserve();
      await db.exec(
        "delete from ctt_jobs;update ctt_usage set last_request=now()-interval '11 seconds'",
      );
    }
    await assert.rejects(reserve, /free_trial_exhausted/);
    assert.equal((await db.query("select * from ctt_jobs")).rows.length, 0);
    assert.equal(
      (
        await db.query<{ used: number }>(
          "select free_scrapes_used as used from ctt_plans",
        )
      ).rows[0].used,
      5,
    );
    await db.exec(
      "update ctt_plans set i7_plan='starter',i7_valid_until=now()+interval '1 hour',daily_limit=10",
    );
    await reserve();
    assert.equal(
      (
        await db.query<{ used: number }>(
          "select free_scrapes_used as used from ctt_plans",
        )
      ).rows[0].used,
      5,
    );
  } finally {
    await db.close();
  }
});
