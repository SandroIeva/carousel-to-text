import { test } from "node:test";
import assert from "node:assert/strict";
import { isRetryableGeminiFailure, retryFailedSlides } from "../lib/retry-failed-slides";
import { showExtraction } from "../lib/history";
import type { Job } from "../lib/types";

test("retry keeps completed slides and permanent failures intact", () => {
  const slides: Job["slides"] = [
    { position: 1, imageUrl: "https://example.com/1", kind: "image", status: "completed", text: "Keep me" },
    { position: 2, imageUrl: "https://example.com/2", kind: "image", status: "failed", text: "", error: "Gemini HTTP 503: Provider temporarily unavailable. Please retry later." },
    { position: 3, imageUrl: "https://example.com/3", kind: "image", status: "failed", text: "", error: "Gemini HTTP 403: Access denied." },
  ];
  const job = { slides } as Job;
  const retried = retryFailedSlides(job);
  assert.equal(retried[0], slides[0]);
  assert.equal(retried[1].status, "pending");
  assert.equal(retried[1].error, undefined);
  assert.equal(retried[1].retryCount, 1);
  assert.equal(retried[2], slides[2]);
  assert.equal(slides[1].status, "failed");
  assert.equal(isRetryableGeminiFailure(slides[1]), true);
  assert.equal(isRetryableGeminiFailure(slides[2]), false);
  assert.equal(showExtraction({ ...job, status: "failed", slides: [slides[1]] }), true);
  assert.equal(isRetryableGeminiFailure({ ...slides[1], retryCount: 3 }), false);
});
