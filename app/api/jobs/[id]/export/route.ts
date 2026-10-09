import { identity, errorResponse, HttpError } from "@/lib/server";
import { exportJob } from "@/lib/core";
import { terminal, type Job } from "@/lib/types";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await identity();
    const { id } = await params;
    const format = new URL(req.url).searchParams.get("format") || "md";
    if (!["md", "txt", "json"].includes(format))
      throw new HttpError("Unbekanntes Exportformat.");
    const { data, error } = await db
      .from("ctt_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError("Nicht gefunden.", 404);
    if (!terminal(data.status))
      throw new HttpError("Extraktion läuft noch.", 409);
    const file = exportJob(data as Job, format);
    return new Response(file.body, {
      headers: {
        "Content-Type": file.type + "; charset=utf-8",
        "Content-Disposition": `attachment; filename="carousel-${id}.${file.extension}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
