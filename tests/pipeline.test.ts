import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceJob } from "../lib/pipeline";
import type { Job } from "../lib/types";
const base: Job = {
  id: "id",
  user_id: "user",
  url: "https://www.instagram.com/p/abc/",
  status: "queued",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  owner: null,
  caption: null,
  slides: [],
  apify_run_id: null,
  dataset_id: null,
  scraping_started_at: null,
  error: null,
  lease_token: "lease",
  attempts: 1,
};
const providers = {
  startApify: async () => ({ id: "run", defaultDatasetId: "data" }),
  apifyRun: async () => ({ status: "SUCCEEDED" }),
  apifyPost: async () => ({
    shortCode: "abc",
    type: "Sidecar",
    childPosts: [{ displayUrl: "https://s.fbcdn.net/1" }, { type: "Video" }],
  }),
  transcribe: async () => "# Original",
};
test("queue starts actor and persists identifiers", async () => {
  const p = await advanceJob(base, providers);
  assert.equal(p.status, "scraping");
  assert.equal(p.apify_run_id, "run");
  assert.ok(p.scraping_started_at);
});
test("completed actor can resume even after dashboard was closed", async () => {
  const p = await advanceJob(
    { ...base, status: "scraping", apify_run_id: "run", dataset_id: "data" },
    providers,
  );
  assert.equal(p.status, "processing");
  assert.equal((p.slides as unknown[]).length, 2);
});
test("partial jobs retain video positions and faithful OCR", async () => {
  const scrape = await advanceJob({ ...base, status: "scraping" }, providers);
  const p = await advanceJob(
    { ...base, status: "processing", slides: scrape.slides as Job["slides"] },
    providers,
  );
  assert.equal(p.status, "partial");
  const s = p.slides as Job["slides"];
  assert.equal(s[0].text, "# Original");
  assert.equal(s[1].position, 2);
  assert.equal(s[1].status, "unsupported");
});
test("failed OCR marks only current slide and continues", async () => {
  const slides: Job["slides"] = [1, 2].map((position) => ({
    position,
    imageUrl: "https://s.fbcdn.net/a",
    kind: "image",
    status: "pending",
    text: "",
  }));
  const p = await advanceJob(
    { ...base, status: "processing", slides },
    {
      ...providers,
      transcribe: async () => {
        throw new Error("upstream");
      },
    },
  );
  assert.equal(p.status, "processing");
  assert.equal((p.slides as Job["slides"])[0].status, "failed");
  assert.equal((p.slides as Job["slides"])[1].status, "pending");
});
test("successful final slide completes job, retry budget prevents runaway", async () => {
  const slides: Job["slides"] = [
    {
      position: 1,
      imageUrl: "https://s.fbcdn.net/a",
      kind: "image",
      status: "pending",
      text: "",
    },
  ];
  assert.equal(
    (await advanceJob({ ...base, status: "processing", slides }, providers))
      .status,
    "completed",
  );
  assert.equal(
    (await advanceJob({ ...base, attempts: 4 }, providers)).status,
    "failed",
  );
});
