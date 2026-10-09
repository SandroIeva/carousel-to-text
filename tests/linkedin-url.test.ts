import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLinkedInUrl } from "../lib/linkedin-url";

const shared = "https://www.linkedin.com/posts/benrmatthews_the-big-linkedin-carousel-shift-ugcPost-7477337554003001346-ME3M";
const canonical = "https://www.linkedin.com/posts/benrmatthews_the-big-linkedin-carousel-shift-activity-7477337555148046336-cBNZ";
test("resolves LinkedIn ugcPost to its canonical activity without guessing IDs", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), shared);
      assert.equal(init?.redirect, "error");
      return new Response(`<link href="${canonical}" rel="canonical">`, { headers: { "Content-Type": "text/html" } });
    };
    assert.equal(await resolveLinkedInUrl(shared + "/?utm_source=share"), canonical);
    assert.equal(await resolveLinkedInUrl(canonical), canonical);
    for (const href of ["https://evil.test/posts/a", canonical.replace("benrmatthews", "someoneelse")]) {
      globalThis.fetch = async () => new Response(`<link rel="canonical" href="${href}">`, { headers: { "Content-Type": "text/html" } });
      await assert.rejects(() => resolveLinkedInUrl(shared), /Could not resolve/);
    }
    globalThis.fetch = async () => new Response("x".repeat(1000001), { headers: { "Content-Type": "text/html" } });
    await assert.rejects(() => resolveLinkedInUrl(shared), /Could not resolve/);
  } finally { globalThis.fetch = original; }
});
