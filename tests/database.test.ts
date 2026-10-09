import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  R = "33333333-3333-4333-8333-333333333333";
test("database: RLS, permissions, quota, idempotency, leases and deletion", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;insert into auth.users values ('${A}'),('${B}');`,
  );
  await db.exec(readFileSync("schema.sql", "utf8"));
  await db.exec("set role service_role");
  const reserve = async (user: string, request = R) =>
    db.query<{ id: string }>(
      "select public.ctt_reserve_job($1,$2,$3,$4) as id",
      [
        user,
        "https://www.instagram.com/p/a/",
        request,
        user === A ? "a".repeat(64) : "b".repeat(64),
      ],
    );
  const first = await reserve(A);
  const id = first.rows[0].id;
  assert.equal((await reserve(A)).rows[0].id, id);
  assert.equal(
    (
      await db.query<{ used: number }>(
        "select used from ctt_usage where user_id=$1",
        [A],
      )
    ).rows[0].used,
    1,
  );
  await assert.rejects(() => reserve(A, crypto.randomUUID()), /rate/);
  await db.query("update ctt_plans set monthly_limit=1 where user_id=$1", [A]);
  await assert.rejects(() => reserve(A, crypto.randomUUID()), /quota/);
  const b = (await reserve(B)).rows[0].id;
  const claim = await db.query<{ job: { lease_token: string } }>(
    "select ctt_claim_job($1) as job",
    [id],
  );
  assert.ok(claim.rows[0].job.lease_token);
  assert.equal(
    (await db.query<{ job: unknown }>("select ctt_claim_job($1) as job", [id]))
      .rows[0].job,
    null,
  );
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [A]);
  assert.deepEqual(
    (await db.query<{ id: string }>("select id from ctt_jobs")).rows.map(
      (r) => r.id,
    ),
    [id],
  );
  assert.equal(
    (await db.query("select * from ctt_usage where user_id=$1", [B])).rows
      .length,
    0,
  );
  await assert.rejects(
    () => db.query("select ctt_claim_job($1)", [b]),
    /permission denied/,
  );
  await assert.rejects(
    () => reserve(A, crypto.randomUUID()),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("update ctt_plans set monthly_limit=999"),
    /permission denied/,
  );
  assert.equal(
    (await db.query("delete from ctt_jobs where id=$1 returning id", [id])).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query("delete from ctt_jobs where id=$1 returning id", [b])).rows
      .length,
    0,
  );
  await db.exec("set role service_role");
  await db.query("update ctt_jobs set status='completed' where id=$1", [id]);
  await db.exec("set role authenticated");
  assert.equal(
    (await db.query("delete from ctt_jobs where id=$1 returning id", [id])).rows
      .length,
    1,
  );
  assert.equal(
    (await db.query<{ used: number }>("select used from ctt_usage")).rows[0]
      .used,
    1,
  );
  await db.exec("set role anon");
  await assert.rejects(
    () => db.query("select * from ctt_jobs"),
    /permission denied/,
  );
  await db.close();
});
