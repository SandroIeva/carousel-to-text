import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { requestIpHash } from "../lib/ip-limit";
import { usageDay } from "../lib/daily-limit";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
test("daily quota: three reservations, cross-account IP block, deletion/idempotency and RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;insert into auth.users values ('${A}'),('${B}');`,
    );
    await db.exec(readFileSync("schema.sql", "utf8"));
    await db.exec("set role service_role");
    const ip = "a".repeat(64),
      other = "b".repeat(64);
    const reserve = async (user: string, hash = ip, id = crypto.randomUUID()) =>
      db.query<{ id: string }>("select ctt_reserve_job($1,$2,$3,$4) as id", [
        user,
        "https://www.instagram.com/p/a/",
        id,
        hash,
      ]);
    const r = crypto.randomUUID(),
      first = (await reserve(A, ip, r)).rows[0].id;
    await reserve(A, ip, r);
    await assert.rejects(() => reserve(A, ip), /rate/);
    for (let i = 0; i < 2; i++) {
      await db.exec(
        "update ctt_usage set last_request=now()-interval '11 seconds'",
      );
      await reserve(A, ip);
    }
    await assert.rejects(() => reserve(A, other), /daily_user_quota/);
    await assert.rejects(() => reserve(B, ip), /daily_ip_quota/);
    assert.equal((await db.query("select id from ctt_jobs")).rows.length, 3,
      "rejected requests do not create empty history rows");
    assert.equal(
      (
        await db.query<{ used: number }>(
          "select used from ctt_ip_usage where ip_hash=$1",
          [ip],
        )
      ).rows[0].used,
      3,
    );
    await db.exec("update ctt_jobs set status='failed'; delete from ctt_jobs");
    await assert.rejects(() => reserve(A, other), /daily_user_quota/);
    await assert.rejects(() => reserve(B, ip), /daily_ip_quota/);
    const fresh = (await reserve(B, other)).rows[0].id;
    assert.notEqual(fresh, first);
    await assert.rejects(
      () =>
        db.query("select ctt_reserve_job($1,$2,$3)", [
          B,
          "url",
          crypto.randomUUID(),
        ]),
      /permission denied/,
    );
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [B]);
    assert.equal(
      (await db.query("select * from ctt_daily_usage")).rows.length,
      1,
    );
    await assert.rejects(
      () => db.query("select * from ctt_ip_usage"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("update ctt_daily_usage set used=0"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("update ctt_plans set quota_exempt=true"),
      /permission denied/,
    );
    await db.exec("set role service_role");
    // Old-day buckets do not count towards today; no reset by deleting extraction results.
    await db.exec(
      "update ctt_daily_usage set day=day-1;update ctt_ip_usage set day=day-1;update ctt_usage set last_request=now()-interval '11 seconds';update ctt_jobs set status='completed'",
    );
    await reserve(A, ip);
    assert.equal(
      (
        await db.query<{ used: number }>(
          "select used from ctt_daily_usage where user_id=$1 and day=(now() at time zone 'Europe/Berlin')::date",
          [A],
        )
      ).rows[0].used,
      1,
    );
    await db.query("update ctt_plans set quota_exempt=true,monthly_limit=0 where user_id=$1", [B]);
    await db.query("update ctt_daily_usage set used=3 where user_id=$1", [B]);
    await db.query("update ctt_ip_usage set used=3 where ip_hash=$1", [ip]);
    const ownerRequest = crypto.randomUUID();
    const exemptJob = (await reserve(B, ip, ownerRequest)).rows[0].id;
    assert.equal((await reserve(B, ip, ownerRequest)).rows[0].id, exemptJob);
    for (let i = 0; i < 4; i++) await reserve(B, ip);
    assert.equal((await db.query<{used:number}>("select used from ctt_ip_usage where ip_hash=$1 and day=(now() at time zone 'Europe/Berlin')::date", [ip])).rows[0].used, 3,
      "exempt account does not consume shared network quota");
  } finally {
    await db.close();
  }
});
test("trusted Vercel IP hashing canonicalizes addresses and fails closed", () => {
  const previous = {
    vercel: process.env.VERCEL,
    key: process.env.IP_HASH_SECRET,
    node: process.env.NODE_ENV,
  };
  try {
    process.env.VERCEL = "1";
    process.env.IP_HASH_SECRET = "test-only-secret";
    const hash = (ip: string) =>
      requestIpHash(
        new Request("https://app.test/api/jobs", {
          headers: {
            "x-vercel-forwarded-for": ip,
            "x-forwarded-for": "9.9.9.9",
          },
        }),
      );
    assert.equal(hash("2001:db8::1"), hash("2001:0db8:0:0:0:0:0:1"));
    assert.equal(hash("::ffff:192.0.2.1"), hash("192.0.2.1"));
    assert.notEqual(hash("192.0.2.1"), hash("192.0.2.2"));
    assert.match(hash("192.0.2.1"), /^[0-9a-f]{64}$/);
    assert.throws(() => hash("1.2.3.4, 5.6.7.8"));
    assert.throws(() => requestIpHash(new Request("https://app.test/")));
    delete process.env.VERCEL;
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.throws(() => hash("192.0.2.1"), /trusted Vercel/);
  } finally {
    for (const [k, v] of [
      ["VERCEL", previous.vercel],
      ["IP_HASH_SECRET", previous.key],
      ["NODE_ENV", previous.node],
    ]) {
      if (v === undefined) delete process.env[k!];
      else process.env[k!] = v;
    }
  }
});
test("day resets at Berlin midnight including daylight saving", () => {
  assert.equal(usageDay(new Date("2026-10-09T21:59:59Z")), "2026-10-09");
  assert.equal(usageDay(new Date("2026-10-09T22:00:00Z")), "2026-10-10");
  assert.equal(usageDay(new Date("2026-12-09T23:00:00Z")), "2026-12-10");
});
