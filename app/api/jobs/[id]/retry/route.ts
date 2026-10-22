import { admin, identity, sameOrigin, errorResponse, HttpError } from "@/lib/server";
import { isRetryableGeminiFailure, retryFailedSlides } from "@/lib/retry-failed-slides";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const { db, user } = await identity();
    const { id } = await params;
    const { data, error } = await db
      .from("ctt_jobs")
      .select("id,user_id,status,slides")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError("Not found.", 404);
    if (data.status !== "partial" && data.status !== "failed")
      throw new HttpError("This extraction is already running or complete.", 409);
    const job = data as Job;
    if (!Array.isArray(job.slides) || !job.slides.some(isRetryableGeminiFailure))
      throw new HttpError("There are no temporary Gemini failures to retry.", 409);

    const { data: updated, error: updateError } = await admin()
      .from("ctt_jobs")
      .update({
        slides: retryFailedSlides(job),
        status: "processing",
        error: null,
        next_step_at: new Date().toISOString(),
        lease_token: null,
        lease_until: null,
        attempts: 0,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .in("status", ["partial", "failed"])
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new HttpError("This extraction changed. Please refresh.", 409);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
