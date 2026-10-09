import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSavedContent } from "../lib/history";
import type { Job } from "../lib/types";

test("history only shows finished extractions with readable content", () => {
  const job = { status: "failed", slides: [] } as unknown as Job;
  assert.equal(hasSavedContent(job), false);
  job.slides = [{ position: 1, imageUrl: null, kind: "image", status: "failed", text: "" }];
  assert.equal(hasSavedContent(job), false);
  job.slides[0] = { ...job.slides[0], status: "completed", text: "Readable text" };
  job.status = "processing";
  assert.equal(hasSavedContent(job), false);
  job.status = "partial";
  assert.equal(hasSavedContent(job), true);
  job.status = "completed";
  assert.equal(hasSavedContent(job), true);
  job.slides[0].text = "  \n ";
  assert.equal(hasSavedContent(job), false);
});
