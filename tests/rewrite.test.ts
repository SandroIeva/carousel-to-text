import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { rewriteSource, rewriteSlides } from "../lib/rewrite";
import type { Job } from "../lib/types";
test("rewrite generation preserves positions, isolates instructions and rejects incomplete output", async () => {
  const original = globalThis.fetch;
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-secret";
  const source = [
    { position: 1, text: "Hook" },
    { position: 3, text: "An insight" },
  ];
  try {
    globalThis.fetch = async (url, init) => {
      assert.ok(!String(url).includes("test-secret"));
      assert.equal(
        (init?.headers as Record<string, string>)["x-goog-api-key"],
        "test-secret",
      );
      const body = JSON.parse(String(init?.body));
      assert.ok(body.systemInstruction);
      assert.deepEqual(
        JSON.parse(body.contents[0].parts[0].text).sourceSlides,
        source,
      );
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    slides: [
                      { position: 1, text: "New hook" },
                      { position: 3, text: "New insight" },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      });
    };
    assert.equal(
      (await rewriteSlides(source, "For freelancers"))[1].position,
      3,
    );
    globalThis.fetch = async () =>
      Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] });
    await assert.rejects(() => rewriteSlides(source, ""), /incomplete/);
    globalThis.fetch = async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { text: '{"slides":[{"position":1,"text":"only one"}]}' },
              ],
            },
          },
        ],
      });
    await assert.rejects(() => rewriteSlides(source, ""), /did not match/);
    assert.throws(
      () => rewriteSource({ slides: [] } as unknown as Job),
      /no readable/,
    );
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});
test("rewrite database: ownership, shared IP quotas, leases, saved-version preservation and cascade", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}');`,
    );
    await db.exec(readFileSync("schema.sql", "utf8"));
    await db.exec("set role service_role");
    const job = async (user: string) =>
      (
        await db.query<{ id: string }>(
          "insert into ctt_jobs(user_id,url,request_id,status) values($1,'https://www.instagram.com/p/abc/',$2,'completed') returning id",
          [user, crypto.randomUUID()],
        )
      ).rows[0].id;
    const id = await job(a),
      other = await job(b),
      ip = "a".repeat(64);
    const claim = (user: string, j: string) =>
      db.query("select ctt_claim_rewrite($1,$2,$3,$4)", [
        user,
        j,
        ip,
        "My angle",
      ]);
    await assert.rejects(() => claim(b, id), /not_found/);
    await claim(a, id);
    await assert.rejects(() => claim(a, id), /busy/);
    await db.query(
      "update ctt_rewrites set status='ready',slides=$1,lease_until=null where job_id=$2",
      [JSON.stringify([{ position: 1, text: "Keep me" }]), id],
    );
    await claim(a, id);
    assert.equal(
      (
        await db.query<{ slides: { text: string }[] }>(
          "select slides from ctt_rewrites where job_id=$1",
          [id],
        )
      ).rows[0].slides[0].text,
      "Keep me",
    );
    await db.exec("update ctt_rewrites set status='failed',lease_until=null");
    await claim(a, id);
    await db.exec("update ctt_rewrites set status='ready',lease_until=null");
    await assert.rejects(() => claim(a, id), /quota/);
    await assert.rejects(() => claim(b, other), /quota/);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal((await db.query("select * from ctt_rewrites")).rows.length, 0);
    await assert.rejects(
      () => db.exec("update ctt_rewrites set status='ready'"),
      /permission denied/,
    );
    await assert.rejects(() => claim(a, id), /permission denied/);
    await assert.rejects(
      () => db.exec("select * from ctt_rewrite_usage"),
      /permission denied/,
    );
    await db.exec("set role service_role");
    await db.query(
      "insert into ctt_plans(user_id,quota_exempt) values($1,true)",
      [b],
    );
    await claim(b, other);
    await db.query("delete from ctt_jobs where id=$1", [id]);
    assert.equal(
      (await db.query("select * from ctt_rewrites where job_id=$1", [id])).rows
        .length,
      0,
    );
  } finally {
    await db.close();
  }
});
