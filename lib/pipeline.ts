import "server-only";
import { parseSlides } from "./core";
import { apifyPost, apifyRun, startApify, transcribe } from "./providers";
import type { Job } from "./types";
export async function advanceJob(
  job: Job,
  providers = { apifyPost, apifyRun, startApify, transcribe },
) {
  let patch: Record<string, unknown> = {};
  try {
    if (job.attempts > 3) throw new Error("Retry budget exhausted");
    if (job.status === "queued") {
      const run = await providers.startApify(job.url);
      patch = {
        status: "scraping",
        apify_run_id: run.id,
        dataset_id: run.defaultDatasetId,
        scraping_started_at: new Date().toISOString(),
      };
    } else if (job.status === "scraping") {
      const run = await providers.apifyRun(job.apify_run_id!);
      if (
        run.status !== "SUCCEEDED" &&
        Date.now() - Date.parse(job.scraping_started_at || job.created_at) >
          20 * 60 * 1000
      )
        throw new Error("Scraper timeout");
      if (run.status === "SUCCEEDED") {
        const post = await providers.apifyPost(job.dataset_id!, job.url);
        patch = {
          status: "processing",
          slides: parseSlides(post),
          owner: String(post.ownerUsername || "unknown"),
          caption: String(post.caption || ""),
        };
      } else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status))
        throw new Error("Scraper failed");
    } else if (job.status === "processing") {
      const slides = job.slides.map((s) => ({ ...s }));
      const slide = slides.find((s) => s.status === "pending");
      if (slide) {
        try {
          slide.text = await providers.transcribe(slide.imageUrl!);
          slide.status = "completed";
        } catch {
          slide.status = "failed";
          slide.error =
            "Text recognition failed. The image may have expired or may be unreadable.";
        }
      }
      const pending = slides.some((s) => s.status === "pending");
      const good = slides.filter((s) => s.status === "completed").length;
      patch = {
        slides,
        status: pending
          ? "processing"
          : good === slides.length
            ? "completed"
            : good
              ? "partial"
              : "failed",
        error: !pending && !good ? "No slides could be transcribed." : null,
      };
    }
  } catch {
    patch = {
      status: "failed",
      error:
        "Extraction failed. Please check the public link and server configuration.",
    };
  }
  return patch;
}
