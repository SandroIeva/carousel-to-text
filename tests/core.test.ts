import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUrl,
  validateImageUrl,
  parseSlides,
  exportJob,
} from "../lib/core";
test("normalizes Instagram links without tracking", () =>
  assert.equal(
    normalizeUrl(" http://instagram.com/p/Ab_C-1/?igsh=x "),
    "https://www.instagram.com/p/Ab_C-1/",
  ));
test("rejects non-post links and deceptive hosts", () => {
  for (const u of [
    "https://instagram.com.evil.test/p/a",
    "https://evil.test/p/a",
    "https://instagram.com/explore",
    "https://user:pw@instagram.com/p/a",
    "https://instagram.com:4000/p/a",
    null,
  ])
    assert.throws(() => normalizeUrl(u));
});
test("media SSRF allowlist rejects private and deceptive URLs", () => {
  assert.equal(
    validateImageUrl("https://s.cdninstagram.com/a"),
    "https://s.cdninstagram.com/a",
  );
  for (const u of [
    "http://s.cdninstagram.com/a",
    "https://127.0.0.1/a",
    "https://fbcdn.net.evil.test/a",
    "https://evilfbcdn.net/a",
    "https://u:p@s.fbcdn.net/a",
    "https://s.fbcdn.net:444/a",
  ])
    assert.throws(() => validateImageUrl(u));
});
test("preserves order including video and missing media", () => {
  const s = parseSlides({
    childPosts: [
      { displayUrl: "https://s.fbcdn.net/1" },
      { type: "Video" },
      { foo: "missing" },
      { displayUrl: "https://s.fbcdn.net/4" },
    ],
  });
  assert.deepEqual(
    s.map((x) => [x.position, x.status]),
    [
      [1, "pending"],
      [2, "unsupported"],
      [3, "failed"],
      [4, "pending"],
    ],
  );
});
test("does not silently truncate large carousels", () =>
  assert.throws(() =>
    parseSlides({ images: Array(26).fill("https://s.fbcdn.net/a") }),
  ));
test("exports retain unicode, failures and caption", () => {
  const job = {
    id: "id",
    url: "https://www.instagram.com/p/abc/",
    owner: "creator",
    caption: "Caption äöü",
    created_at: "2026-10-09",
    status: "partial" as const,
    slides: [
      {
        position: 1,
        imageUrl: "https://s.fbcdn.net/a",
        kind: "image" as const,
        status: "completed" as const,
        text: "# Überschrift\n\n**42 €**",
      },
      {
        position: 2,
        imageUrl: null,
        kind: "video" as const,
        status: "unsupported" as const,
        text: "",
        error: "Video-Slide",
      },
    ],
  };
  const j = JSON.parse(exportJob(job, "json").body);
  assert.equal(j.slides[1].position, 2);
  assert.equal(j.caption, job.caption);
  assert.ok(!("imageUrl" in j.slides[0]));
  assert.match(exportJob(job, "md").body, /## Slide 2\n\n\[Video-Slide\]/);
  assert.match(exportJob(job, "txt").body, /Überschrift\n\n42 €/);
  assert.throws(() => exportJob(job, "html"));
});
