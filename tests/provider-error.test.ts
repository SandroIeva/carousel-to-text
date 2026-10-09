import { test } from "node:test";
import assert from "node:assert/strict";
import { providerHttpFailure, ProviderFailure } from "../lib/provider-error";
import { advanceJob } from "../lib/pipeline";
import type { Job } from "../lib/types";
test("provider diagnostics identify the failing service and preserve no provider body or secrets", async () => {
  assert.match(
    providerHttpFailure("Gemini", 429).message,
    /Gemini HTTP 429.*Rate limit or quota/,
  );
  assert.match(providerHttpFailure("Gemini", 403).message, /permissions/);
  assert.match(providerHttpFailure("Image", 403).message, /Image HTTP 403/);
  const job = {
    status: "processing",
    attempts: 1,
    slides: [
      {
        position: 1,
        imageUrl: "https://s.fbcdn.net/a",
        kind: "image",
        status: "pending",
        text: "",
      },
    ],
  } as Job;
  const providers = {
    startApify: async () => ({ id: "", defaultDatasetId: "" }),
    apifyRun: async () => ({ status: "" }),
    apifyPost: async () => ({}),
    transcribe: async () => {
      throw new ProviderFailure(
        "Gemini HTTP 429: Rate limit or quota exceeded.",
      );
    },
  };
  const patch = await advanceJob(job, providers);
  assert.match((patch.slides as Job["slides"])[0].error!, /Gemini HTTP 429/);
  providers.transcribe = async () => {
    throw new Error("sensitive-provider-body");
  };
  assert.ok(
    !JSON.stringify(await advanceJob(job, providers)).includes(
      "sensitive-provider-body",
    ),
  );
});
