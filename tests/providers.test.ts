import { test } from "node:test";
import assert from "node:assert/strict";
import { startApify, apifyPost, readImage, transcribe } from "../lib/providers";
test("provider requests: secrets in headers, source matching, image bounds and incomplete OCR", async () => {
  const original = globalThis.fetch;
  process.env.APIFY_TOKEN = "test-apify-secret";
  process.env.GEMINI_API_KEY = "test-gemini-secret";
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      assert.ok(!url.includes("test-apify-secret"));
      assert.equal(new URL(url).searchParams.get("maxTotalChargeUsd"), "0.01");
      assert.equal(new URL(url).searchParams.get("maxItems"), "1");
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer test-apify-secret",
      );
      assert.deepEqual(JSON.parse(String(init?.body)).postUrls, [
        "https://www.instagram.com/p/abc/",
      ]);
      return Response.json({
        data: { id: "run", defaultDatasetId: "dataset" },
      });
    };
    assert.equal(
      (await startApify("https://www.instagram.com/p/abc/")).id,
      "run",
    );
    globalThis.fetch = async () =>
      Response.json([
        { shortCode: "wrong", type: "Sidecar" },
        { shortCode: "abc", type: "Sidecar", ownerUsername: "correct" },
      ]);
    assert.equal(
      (await apifyPost("dataset", "https://www.instagram.com/p/abc/"))
        .ownerUsername,
      "correct",
    );
    await assert.rejects(() =>
      apifyPost("dataset", "https://www.instagram.com/p/missing/"),
    );
    globalThis.fetch = async (input) => String(input).includes("/records/OUTPUT")
      ? Response.json({ stopped_early: "charge_limit" })
      : Response.json([]);
    await assert.rejects(() => apifyPost("dataset", "https://www.instagram.com/p/abc/", "store"), /run budget/);
    globalThis.fetch = async () =>
      new Response("bad", { headers: { "content-type": "text/html" } });
    await assert.rejects(
      () => readImage("https://s.fbcdn.net/a"),
      /image format/,
    );
    globalThis.fetch = async () =>
      new Response(new Uint8Array(8000001), {
        headers: { "content-type": "image/jpeg" },
      });
    await assert.rejects(() => readImage("https://s.fbcdn.net/a"), /8 MB/);
    globalThis.fetch = async (input, init) => {
      if (String(input).includes("fbcdn")) {
        assert.equal(init?.redirect, "error");
        return new Response(new Uint8Array([1, 2]), {
          headers: { "content-type": "image/jpeg" },
        });
      }
      assert.equal(
        (init?.headers as Record<string, string>)["x-goog-api-key"],
        "test-gemini-secret",
      );
      assert.match(String(input), /gemini-2.5-flash-lite/);
      return Response.json({
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: "truncated" }] },
          },
        ],
      });
    };
    await assert.rejects(
      () => transcribe("https://s.fbcdn.net/a"),
      /incomplete/,
    );
    globalThis.fetch = async (input) =>
      String(input).includes("fbcdn")
        ? new Response(new Uint8Array([1]), {
            headers: { "content-type": "image/jpeg" },
          })
        : Response.json({
            candidates: [
              {
                finishReason: "STOP",
                content: { parts: [{ text: "# Original\n\n42 €" }] },
              },
            ],
          });
    assert.equal(
      await transcribe("https://s.fbcdn.net/a"),
      "# Original\n\n42 €",
    );
  } finally {
    globalThis.fetch = original;
    delete process.env.APIFY_TOKEN;
    delete process.env.GEMINI_API_KEY;
  }
});

test("Gemini retries temporary 503 responses but never retries credential errors", async () => {
  const original = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-gemini-secret";
  let requests = 0;
  try {
    globalThis.fetch = async (input) => {
      if (String(input).includes("fbcdn"))
        return new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/jpeg" },
        });
      requests++;
      return requests === 1
        ? new Response(null, { status: 503 })
        : Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Recovered" }] } }] });
    };
    assert.equal(await transcribe("https://s.fbcdn.net/a"), "Recovered");
    assert.equal(requests, 2);

    requests = 0;
    globalThis.fetch = async (input) => {
      if (String(input).includes("fbcdn"))
        return new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/jpeg" },
        });
      requests++;
      return new Response(null, { status: 403 });
    };
    await assert.rejects(() => transcribe("https://s.fbcdn.net/a"), /Gemini HTTP 403/);
    assert.equal(requests, 1);

    requests = 0;
    globalThis.fetch = async (input) => {
      if (String(input).includes("fbcdn"))
        return new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/jpeg" },
        });
      requests++;
      return new Response(null, { status: 503 });
    };
    await assert.rejects(() => transcribe("https://s.fbcdn.net/a"), /Gemini HTTP 503/);
    assert.equal(requests, 3);
  } finally {
    globalThis.fetch = original;
    delete process.env.GEMINI_API_KEY;
  }
});
