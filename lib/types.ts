export type Slide = {
  position: number;
  imageUrl: string | null;
  kind: "image" | "video" | "text";
  status: "pending" | "completed" | "failed" | "unsupported";
  text: string;
  error?: string;
};
export type Job = {
  id: string;
  user_id: string;
  url: string;
  status:
    "queued" | "scraping" | "processing" | "completed" | "partial" | "failed";
  created_at: string;
  updated_at: string;
  owner: string | null;
  caption: string | null;
  slides: Slide[];
  apify_run_id: string | null;
  dataset_id: string | null;
  scraping_started_at: string | null;
  error: string | null;
  lease_token: string | null;
  attempts: number;
};
export const terminal = (status: Job["status"]) =>
  ["completed", "partial", "failed"].includes(status);
