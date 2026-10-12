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
      throw new HttpError("Unknown export format.");
    const { data, error } = await db
      .from("ctt_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError("Not found.", 404);
    if (!terminal(data.status))
      throw new HttpError("Extraction is still running.", 409);
    const mine = new URL(req.url).searchParams.get("version") === "mine";
    let exported = data as Job;
    if (mine) {
      const { data: version, error: versionError } = await db.from("ctt_rewrites").select("slides").eq("job_id", id).maybeSingle();
      if (versionError) throw versionError;
      if (!version?.slides?.length) throw new HttpError("No adapted version is available yet.", 404);
      exported = { ...exported, caption: null, owner: null, slides: version.slides.map((s: {position:number;text:string}) => ({...s, imageUrl:null, kind:"text" as const, status:"completed" as const})) };
    }
    const file = exportJob(exported, format);
    return new Response(file.body, {
      headers: {
        "Content-Type": file.type + "; charset=utf-8",
        "Content-Disposition": `attachment; filename="carousel-${id}${mine ? "-my-version" : ""}.${file.extension}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
