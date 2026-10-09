import { terminal, type Job } from "./types";

export function hasSavedContent(job: Job) {
  return terminal(job.status) && job.slides.some(
    (slide) => slide.status === "completed" && slide.text.trim().length > 0,
  );
}
