import "server-only";
import { admin } from "./server";
import { advanceJob } from "./pipeline";
import type { Job } from "./types";
export async function processJob(id: string) {
  const db = admin();
  const { data, error } = await db.rpc("ctt_claim_job", { p_id: id });
  if (error) throw error;
  const job = data as Job | null;
  if (!job) return;
  const patch = await advanceJob(job);
  const { error: saveError } = await db
    .from("ctt_jobs")
    .update({
      ...patch,
      lease_token: null,
      lease_until: null,
      attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("lease_token", job.lease_token);
  if (saveError) throw saveError;
}
