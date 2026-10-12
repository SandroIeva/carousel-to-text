import { savedVersion } from "@/lib/saved-version";
import { identity, sameOrigin, errorResponse, HttpError } from "@/lib/server";
import { verifiedEmail } from "@/lib/i7os";
import { supabasePublicConfig } from "@/lib/supabase-config";
import { i7Import } from "@/lib/i7os-import";
export const maxDuration = 30;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const { db, user } = await identity();
    if (!verifiedEmail(user))
      throw new HttpError(
        "Please confirm your email address before importing into i7OS.",
        401,
      );
    const raw = await req.text();
    if (raw.length > 2048) throw new HttpError("Request is too large.", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError("Invalid request.");
    }
    if (!body || !["workspaces", "document"].includes(body.mode))
      throw new HttpError("Invalid import mode.");
    const { data: session, error: sessionError } = await db.auth.getSession();
    const key = supabasePublicConfig().key;
    if (sessionError || !session.session?.access_token || !key)
      throw new HttpError("Please sign in again.", 401);
    const { id } = await params;
    const { data: job, error } = await db
      .from("ctt_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!job) throw new HttpError("Not found.", 404);
    let payload: Record<string, unknown> = { mode: "workspaces" };
    if (body.mode === "document") {
      if (!/^[0-9a-f-]{36}$/i.test(body.orgId || ""))
        throw new HttpError("Please choose a workspace.");
      if (!["original", "mine"].includes(body.version))
        throw new HttpError("Invalid version.");
      if (
        body.visibility !== undefined &&
        !["restricted", "workspace"].includes(body.visibility)
      )
        throw new HttpError("Invalid visibility.");
      if (!["completed", "partial"].includes(job.status))
        throw new HttpError("Please wait until extraction is finished.", 409);
      let title = (
        job.caption?.split(/\r?\n/).find((line: string) => line.trim()) ||
        job.owner ||
        "Slide Scrape"
      ).slice(0, 200);
      let slides = job.slides
        .filter(
          (s: { status: string; text: string }) =>
            s.status === "completed" && s.text?.trim(),
        )
        .map((s: { text: string }) => ({ text: s.text }));
      if (body.version === "mine") {
        const version = await savedVersion(db, id, body.versionId);
        slides = version.slides
          .filter((s: { text: string }) => s.text?.trim())
          .map((s: { text: string }) => ({ text: s.text }));
        title = version.title || title;
      }
      if (!slides.length || slides.length > 50)
        throw new HttpError("There is no readable text to import.");
      payload = {
        mode: "document",
        orgId: body.orgId,
        title,
        slides,
        sourceUrl: job.url,
        visibility: body.visibility || "restricted",
      };
    }
    return Response.json(
      await i7Import(session.session.access_token, key, payload),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
