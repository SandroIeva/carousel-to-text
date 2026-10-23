import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

test("folders keep extractions owned by one user and deletion leaves them saved", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${owner}'),('${other}');`);
    await db.exec(readFileSync("schema.sql", "utf8"));
    await db.exec("set role service_role");
    const folder = (await db.query<{ id: string }>(
      "insert into ctt_folders(user_id,name) values($1,'Campaigns') returning id", [owner],
    )).rows[0].id;
    const job = (await db.query<{ id: string }>(
      "insert into ctt_jobs(user_id,url,request_id,status,folder_id) values($1,'https://www.instagram.com/p/test/',$2,'completed',$3) returning id",
      [owner, crypto.randomUUID(), folder],
    )).rows[0].id;
    await assert.rejects(
      () => db.query("insert into ctt_jobs(user_id,url,request_id,folder_id) values($1,'https://www.instagram.com/p/test/',$2,$3)", [other, crypto.randomUUID(), folder]),
      /foreign key/,
    );
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.equal((await db.query("select id from ctt_folders")).rows.length, 0);
    await assert.rejects(() => db.query("insert into ctt_folders(user_id,name) values($1,'Sneak')", [owner]), /permission denied/);
    await db.exec("set role service_role");
    await db.query("delete from ctt_folders where id=$1", [folder]);
    const saved = (await db.query<{ folder_id: string | null }>("select folder_id from ctt_jobs where id=$1", [job])).rows[0];
    assert.equal(saved.folder_id, null);
  } finally {
    await db.close();
  }
});
