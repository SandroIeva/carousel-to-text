import { test } from "node:test";
import assert from "node:assert/strict";
import {
  supabasePublicConfig,
  supabaseServerKey,
} from "../lib/supabase-config";
import { configured, integrationsReady } from "../lib/server";

test("Supabase integration aliases support sessions and server readiness without public-key escalation", () => {
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISH_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APIFY_TOKEN",
    "GEMINI_API_KEY",
  ];
  const saved = names.map((n) => process.env[n]);
  try {
    names.forEach((n) => delete process.env[n]);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.APIFY_TOKEN = "test";
    process.env.GEMINI_API_KEY = "test";
    for (const name of names.slice(2, 7)) {
      process.env[name] = "public-test";
      assert.equal(supabasePublicConfig().key, "public-test");
      assert.equal(configured(), true);
      assert.equal(supabaseServerKey(), undefined);
      assert.equal(integrationsReady(), false);
      delete process.env[name];
    }
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
    assert.equal(supabaseServerKey(), "service-test");
    assert.equal(integrationsReady(), true);
    process.env.SUPABASE_SECRET_KEY = "secret-test";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test";
    assert.equal(supabaseServerKey(), "secret-test");
    assert.equal(supabasePublicConfig().key, "publishable-test");
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_URL = "https://fallback.supabase.co";
    assert.equal(configured(), true);
    assert.equal(supabasePublicConfig().url, "https://fallback.supabase.co");
  } finally {
    names.forEach((n, i) => {
      if (saved[i] === undefined) delete process.env[n];
      else process.env[n] = saved[i];
    });
  }
});
