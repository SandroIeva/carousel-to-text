import type { Job, Slide } from "./types";

export function isRetryableGeminiFailure(slide: Slide) {
  return slide.status === "failed" && (slide.retryCount || 0) < 3 &&
    (/^Gemini HTTP 5\d\d:/.test(slide.error || "") ||
      slide.error === "Gemini: Network request failed or timed out.");
}

export function retryFailedSlides(job: Job): Slide[] {
  return job.slides.map((slide) =>
    isRetryableGeminiFailure(slide)
      ? { ...slide, status: "pending", text: "", error: undefined, retryCount: (slide.retryCount || 0) + 1 }
      : slide,
  );
}
