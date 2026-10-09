import { timingSafeEqual } from "node:crypto";
import { admin, errorResponse, integrationsReady } from "@/lib/server";
import { processJob } from "@/lib/worker";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const token = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    token.length !== expected.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401 });
  if (!integrationsReady())
    return Response.json(
      { error: "Server-Konfiguration fehlt." },
      { status: 503 },
    );
  try {
    const { data, error } = await admin()
      .from("ctt_jobs")
      .select("id")
      .in("status", ["queued", "scraping", "processing"])
      .order("created_at")
      .limit(3);
    if (error) throw error;
    for (const row of data || []) await processJob(row.id);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
