import "server-only";
import { HttpError } from "./server";
import type { SupabaseClient } from "@supabase/supabase-js";
export async function savedVersion(
  db: SupabaseClient,
  jobId: string,
  versionId?: unknown,
) {
  if (
    versionId !== undefined &&
    (typeof versionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        versionId,
      ))
  )
    throw new HttpError("Invalid version.");
  let query = db
    .from("ctt_rewrite_versions")
    .select("id,title,slides")
    .eq("job_id", jobId);
  if (versionId) query = query.eq("id", versionId);
  const result = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data)
    throw new HttpError("This version is no longer available.", 404);
  return result.data;
}
