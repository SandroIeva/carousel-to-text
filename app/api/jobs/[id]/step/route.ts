import { identity, sameOrigin, errorResponse, HttpError } from "@/lib/server";
import { processJob } from "@/lib/worker";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const { db } = await identity();
    const { id } = await params;
    const { data, error } = await db
      .from("ctt_jobs")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError("Nicht gefunden.", 404);
    await processJob(id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
