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
      throw new HttpError(
        "Extraktion ist auf dem Server noch nicht eingerichtet.",
        503,
      );
    const text = await req.text();
    if (text.length > 4096) throw new HttpError("Anfrage zu groß.", 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError("Ungültige Anfrage.");
    }
    if (!body || typeof body !== "object")
      throw new HttpError("Ungültige Anfrage.");
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
      throw new HttpError("Ungültige Anfrage-ID.");
    const { data, error } = await admin().rpc("ctt_reserve_job", {
      p_user: user.id,
      p_url: url,
      p_request: requestId,
    });
    if (error) {
      if (error.message.includes("quota"))
        throw new HttpError("Monatliches Nutzungslimit erreicht.", 429);
      if (error.message.includes("active"))
        throw new HttpError("Es laufen bereits drei Extraktionen.", 429);
      if (error.message.includes("rate"))
        throw new HttpError("Bitte zehn Sekunden warten.", 429);
      throw error;
    }
    return Response.json({ id: data }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
