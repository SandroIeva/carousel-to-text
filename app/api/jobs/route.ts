import {
  HttpError,
  identity,
  sameOrigin,
  errorResponse,
  admin,
  integrationsReady,
} from "@/lib/server";
import { normalizeUrl } from "@/lib/core";
export async function GET() {
  try {
    const { db } = await identity();
    const { data, error } = await db
      .from("ctt_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { user } = await identity();
    if (!integrationsReady())
      throw new HttpError("Extraction is not set up on the server yet.", 503);
    const text = await req.text();
    if (text.length > 4096) throw new HttpError("Request is too large.", 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError("Invalid request.");
    }
    if (!body || typeof body !== "object")
      throw new HttpError("Invalid request.");
    let url;
    try {
      url = normalizeUrl(body.url);
    } catch (e) {
      throw new HttpError((e as Error).message);
    }
    const requestId = body.requestId;
    if (
      typeof requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestId,
      )
    )
      throw new HttpError("Invalid request ID.");
    const { data, error } = await admin().rpc("ctt_reserve_job", {
      p_user: user.id,
      p_url: url,
      p_request: requestId,
    });
    if (error) {
      if (error.message.includes("quota"))
        throw new HttpError("Monthly usage limit reached.", 429);
      if (error.message.includes("active"))
        throw new HttpError("Three extractions are already running.", 429);
      if (error.message.includes("rate"))
        throw new HttpError("Please wait ten seconds.", 429);
      throw error;
    }
    return Response.json({ id: data }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
