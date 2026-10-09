import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, parseSlides, exportJob } from "../lib/core";
import { startApify, apifyPost, linkedInDocumentPages } from "../lib/providers";
import { advanceJob } from "../lib/pipeline";
import type { Job } from "../lib/types";
const linkedin =
  "https://www.linkedin.com/posts/openai_document-activity-7487581078262681600-vAk2";
const threads = "https://www.threads.com/@zuck/post/AbC123";
const cdn = "https://media.licdn.com/";

test("accepts the reported LinkedIn ugcPost Copy link and removes tracking", () => {
  const canonical = "https://www.linkedin.com/posts/benrmatthews_the-big-linkedin-carousel-shift-ugcPost-7477337554003001346-ME3M";
  assert.equal(normalizeUrl(canonical + "/?utm_source=share&utm_medium=member_desktop&rcm=tracking"), canonical);
  assert.equal(normalizeUrl(canonical.replace("www.", "de.")), canonical);
  assert.throws(() => normalizeUrl(canonical.replace("ugcPost", "anything")));
});

test("platform normalization rejects aliases, credentials, ports and deceptive domains", () => {
  assert.equal(normalizeUrl(linkedin + "?tracking=1"), linkedin);
  assert.equal(normalizeUrl(linkedin.replace("www.", "de.")), linkedin);
  assert.equal(
    normalizeUrl(threads.replace("threads.com", "threads.net") + "/?x=1"),
    threads,
  );
  for (const url of [
    "https://www.linkedin.com/feed/update/urn:li:activity:123",
    "https://linkedin.com.evil.test/posts/a",
    "https://threads.com.evil.test/@zuck/post/a",
    "https://u:p@threads.com/@zuck/post/a",
    "https://threads.com:444/@zuck/post/a",
    "https://www.linkedin.com/in/person",
    "https://www.threads.com/@zuck",
  ])
    assert.throws(() => normalizeUrl(url));
});

test("platform actors get bounded single-post inputs and budget, secrets stay in headers", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      const u = new URL(String(url));
      assert.equal(u.searchParams.get("maxTotalChargeUsd"), "0.009");
      assert.equal(u.searchParams.get("restartOnError"), "false");
      const input = JSON.parse(String(init?.body));
      assert.equal(input.postUrls.length, 1);
      if (input.postUrls[0] === linkedin) {
        assert.match(u.pathname, /curly~linkedin-post-scraper/);
        assert.deepEqual(input, { postUrls: [linkedin] });
      } else {
        assert.match(u.pathname, /themineworks~threads-scraper/);
        assert.equal(input.mode, "post");
        assert.equal(input.maxPosts, 1);
      }
      return Response.json({ data: { id: "run", defaultDatasetId: "data" } });
    };
    await startApify(linkedin);
    await startApify(threads);
  } finally {
    globalThis.fetch = original;
  }
});

test("LinkedIn full manifest selects best resolution, ordered pages, never cover only", async () => {
  const original = globalThis.fetch;
  try {
    const calls: string[] = [];
    globalThis.fetch = async (url, init) => {
      const source = String(url);
      calls.push(source);
      assert.equal(
        init?.redirect,
        source.startsWith(cdn) ? "error" : undefined,
      );
      if (source.includes("api.apify"))
        return Response.json([
          {
            post_url: linkedin,
            author: { name: "OpenAI" },
            text: "Original post",
            content_type: "document",
            media: [
              {
                type: "document",
                url: cdn + "master",
                thumbnail_url: cdn + "cover",
              },
            ],
          },
        ]);
      if (source === cdn + "master")
        return Response.json({
          perResolutions: [
            { width: 480, imageManifestUrl: cdn + "low" },
            { width: 1920, imageManifestUrl: cdn + "high" },
          ],
        });
      if (source === cdn + "high")
        return Response.json({
          pages: [cdn + "page1", cdn + "page2", cdn + "page3"],
        });
      throw new Error("Unexpected URL");
    };
    const post = await apifyPost("data", linkedin);
    assert.equal(post.ownerUsername, "OpenAI");
    assert.deepEqual(
      parseSlides(post).map((s) => s.imageUrl),
      [cdn + "page1", cdn + "page2", cdn + "page3"],
    );
    assert.ok(!calls.includes(cdn + "cover"));
    assert.ok(!calls.includes(cdn + "low"));
    globalThis.fetch = async () =>
      Response.json({ pages: Array(26).fill(cdn + "page") });
    await assert.rejects(
      () => linkedInDocumentPages(cdn + "master"),
      /25 pages/,
    );
    globalThis.fetch = async () =>
      Response.json({ pages: ["https://127.0.0.1/private"] });
    await assert.rejects(() => linkedInDocumentPages(cdn + "master"));
    globalThis.fetch = async () => Response.json({ thumbnail: cdn + "cover" });
    await assert.rejects(
      () => linkedInDocumentPages(cdn + "master"),
      /cover image/,
    );
    globalThis.fetch = async () =>
      new Response(new Uint8Array(1000001), {
        headers: { "content-type": "application/json" },
      });
    await assert.rejects(() => linkedInDocumentPages(cdn + "master"), /1 MB/);
  } finally {
    globalThis.fetch = original;
  }
});

test("Threads dataset matches requested post rather than context, preserves media order and source text", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json([
        {
          url: "https://www.threads.com/@other/post/Other",
          text: "Wrong context",
        },
        {
          url: threads.replace("threads.com", "threads.net"),
          username: "zuck",
          text: "Original words",
          media_type: "carousel",
          media_urls: [
            "https://s.fbcdn.net/1.jpg",
            "https://s.fbcdn.net/2.mp4",
            "https://s.fbcdn.net/3.jpg",
          ],
        },
        { _type: "info" },
      ]);
    const post = await apifyPost("data", threads);
    assert.equal(post.caption, "Original words");
    assert.deepEqual(
      parseSlides(post).map((s) => s.status),
      ["pending", "unsupported", "pending"],
    );
    await assert.rejects(
      () => apifyPost("data", "https://www.threads.com/@zuck/post/Missing"),
      /matching public post/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("text-only posts complete without OCR and export to all formats", async () => {
  const post = {
    ownerUsername: "creator",
    caption: "Exact text\n\nSecond paragraph",
    textOnly: true,
  };
  const providers = {
    startApify: async () => ({ id: "run", defaultDatasetId: "data" }),
    apifyRun: async () => ({ status: "SUCCEEDED" }),
    apifyPost: async () => post,
    transcribe: async () => {
      throw new Error("OCR must not run");
    },
  };
  const job: Job = {
    id: "id",
    user_id: "user",
    updated_at: new Date().toISOString(),
    owner: null,
    caption: null,
    apify_run_id: "run",
    dataset_id: "data",
    scraping_started_at: new Date().toISOString(),
    error: null,
    lease_token: "lease",
    url: threads,
    status: "scraping",
    attempts: 1,
    created_at: new Date().toISOString(),
    slides: [],
  };
  const patch = await advanceJob(job, providers);
  assert.equal(patch.status, "completed");
  const saved = { ...job, ...patch } as Job;
  assert.equal(saved.slides[0].kind, "text");
  assert.equal(saved.slides[0].text, post.caption);
  for (const format of ["json", "md", "txt"])
    assert.match(exportJob(saved, format).body, /Exact text/);
});
