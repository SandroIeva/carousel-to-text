import {
  identity,
  admin,
  sameOrigin,
  errorResponse,
  HttpError,
} from "@/lib/server";
import { requestIpHash } from "@/lib/ip-limit";
import { syncI7Plan } from "@/lib/i7os";
import { rewriteSource, rewriteSlides } from "@/lib/rewrite";
import { ProviderFailure } from "@/lib/provider-error";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) {
  try {
    const { db } = await identity();
    const { id } = await params;
    const { data, error } = await db
      .from("ctt_rewrites")
      .select("status,angle,title,slides,error,lease_until,updated_at")
      .eq("job_id", id)
      .maybeSingle();
    if (error) throw error;
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request, { params }: Context) {
  let token: string | undefined;
  let jobId: string | undefined;
  try {
    sameOrigin(req);
    const { db, user } = await identity();
    const { id } = await params;
    jobId = id;
    const raw = await req.text();
    if (raw.length > 4096) throw new HttpError("Request is too large.", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError("Invalid request.");
    }
    if (typeof body?.angle !== "string" || body.angle.length > 500)
      throw new HttpError("Your angle must be 500 characters or fewer.");
    const { data: job, error } = await db
      .from("ctt_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!job) throw new HttpError("Not found.", 404);
    if (!["completed", "partial"].includes(job.status))
      throw new HttpError("Please wait until extraction is finished.", 409);
    const source = rewriteSource(job);
    if (!process.env.GEMINI_API_KEY)
      throw new HttpError("Adaptation is not set up on the server yet.", 503);
    let ip: string;
    try {
      ip = requestIpHash(req);
    } catch {
      throw new HttpError("Could not verify your network.", 503);
    }
    const membership = await syncI7Plan(db, user);
    const claim = await admin().rpc("ctt_claim_rewrite", {
      p_user: user.id,
      p_job: id,
      p_ip: ip,
      p_angle: body.angle.trim(),
    });
    if (claim.error) {
      if (claim.error.message.includes("rewrite_quota"))
        throw new HttpError(
          `Your account or network has reached its daily limit of ${membership.rewriteLimit} adaptations. Try again after midnight (Europe/Berlin).`,
          429,
        );
      if (claim.error.message.includes("rewrite_busy"))
        throw new HttpError("Your version is already being generated.", 409);
      throw claim.error;
    }
    token = claim.data;
    const { title, slides } = await rewriteSlides(source, body.angle.trim());
    const saved = await admin()
      .from("ctt_rewrites")
      .update({
        slides,
        title,
        status: "ready",
        error: null,
        lease_token: null,
        lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", id)
      .eq("lease_token", token)
      .select("status,angle,title,slides,error,updated_at")
      .maybeSingle();
    if (saved.error) throw saved.error;
    if (!saved.data)
      throw new HttpError(
        "The post was deleted or a newer generation started.",
        409,
      );
    return Response.json(saved.data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (token && jobId)
      await admin()
        .from("ctt_rewrites")
        .update({
          status: "failed",
          error:
            e instanceof ProviderFailure
              ? e.message
              : "Could not create your version. Please try again.",
          lease_token: null,
          lease_until: null,
        })
        .eq("job_id", jobId)
        .eq("lease_token", token);
    if (e instanceof ProviderFailure)
      return errorResponse(new HttpError(e.message, 502));
    return errorResponse(e);
  }
}
