import { test } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../lib/server";
import { normalizeUrl } from "../lib/core";

test("origin validation accepts exact configured Vercel domains and rejects foreign or forged origins", () => {
  const names = [
    "APP_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
  ];
  const saved = names.map((n) => process.env[n]);
  const req = (origin?: string) =>
    new Request("https://carousel-to-text.vercel.app/api/jobs", {
      headers: origin
        ? { origin, host: "evil.example", "x-forwarded-host": "evil.example" }
        : {},
    });
  try {
    names.forEach((n) => delete process.env[n]);
    process.env.APP_URL = "http://localhost:3000";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "carousel-to-text.vercel.app";
    process.env.VERCEL_URL = "carousel-preview.vercel.app";
    process.env.VERCEL_BRANCH_URL = "carousel-git-main.vercel.app";
    for (const origin of [
      "http://localhost:3000",
      "https://carousel-to-text.vercel.app",
      "https://carousel-preview.vercel.app",
      "https://carousel-git-main.vercel.app",
    ])
      assert.doesNotThrow(() => sameOrigin(req(origin)));
    for (const origin of [
      undefined,
      "null",
      "https://evil.example",
      "https://carousel-to-text.vercel.app.evil.example",
      "http://carousel-to-text.vercel.app",
    ])
      assert.throws(() => sameOrigin(req(origin)), /Request not allowed/);
    process.env.APP_URL = "invalid";
    assert.doesNotThrow(() =>
      sameOrigin(req("https://carousel-to-text.vercel.app")),
    );
    names.forEach((n) => delete process.env[n]);
    assert.throws(
      () => sameOrigin(req("https://carousel-to-text.vercel.app")),
      /Request not allowed/,
    );
  } finally {
    names.forEach((n, i) => {
      if (saved[i] === undefined) delete process.env[n];
      else process.env[n] = saved[i];
    });
  }
});

test("reported Instagram URL is valid and tracking parameters are removed", () => {
  assert.equal(
    normalizeUrl(
      "https://www.instagram.com/p/DeG6BqdiE1n/?utm_source=ig_web_copy_link&dlrf=NTc4MTIwNjQ2YQ==",
    ),
    "https://www.instagram.com/p/DeG6BqdiE1n/",
  );
});
