import { test } from "node:test";
import assert from "node:assert/strict";
import { i7Import } from "../lib/i7os-import";
const id = "11111111-1111-4111-8111-111111111111",
  doc = "22222222-2222-4222-8222-222222222222";
test("i7OS import retains read-only workspaces, guards links, uses private visibility and does not retry writes", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://app.i7os.com/api/slidescrape-import");
      assert.equal(init?.redirect, "error");
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer session-token",
      );
      assert.ok(!String(url).includes("session-token"));
      return Response.json({
        workspaces: [
          {
            id,
            name: "Read only",
            slug: "read-only",
            plan: "free",
            canWrite: false,
          },
        ],
      });
    };
    const list = await i7Import("session-token", "public-key", {
      mode: "workspaces",
    });
    assert.ok(list.workspaces);
    assert.equal(list.workspaces[0].canWrite, false);
    globalThis.fetch = async () => Response.json({ workspaces: [] });
    assert.deepEqual(await i7Import("t", "k", { mode: "workspaces" }), {
      workspaces: [],
    });
    const payload = {
      mode: "document",
      orgId: id,
      title: "My title",
      slides: [{ text: "First slide" }],
      visibility: "restricted",
    };
    globalThis.fetch = async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).visibility, "restricted");
      return Response.json({
        id: doc,
        url: `https://app.i7os.com/team?doc=${doc}`,
        workspace: { id, name: "Team" },
      });
    };
    assert.equal(
      ((await i7Import("t", "k", payload)) as { id: string }).id,
      doc,
    );
    globalThis.fetch = async () =>
      Response.json({
        id: doc,
        url: `https://evil.test/team?doc=${doc}`,
        workspace: { id, name: "Team" },
      });
    await assert.rejects(() => i7Import("t", "k", payload), /invalid link/);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: "read_only" }), { status: 403 });
    await assert.rejects(() => i7Import("t", "k", payload), /no active/);
    globalThis.fetch = async () => {
      calls++;
      throw new Error("network");
    };
    await assert.rejects(
      () => i7Import("t", "k", payload),
      /Check i7OS before trying again/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
