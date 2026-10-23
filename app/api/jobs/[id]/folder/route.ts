import { admin, errorResponse, HttpError, identity, sameOrigin } from "@/lib/server";
import { isUuid } from "@/lib/folders";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(req);
    const { user } = await identity();
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError("Invalid extraction ID.");
    const text = await req.text();
    if (text.length > 512) throw new HttpError("Invalid request.", 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new HttpError("Invalid request."); }
    const folderId = (body as { folderId?: unknown } | null)?.folderId;
    if (folderId !== null && !isUuid(folderId)) throw new HttpError("Invalid folder ID.");
    const db = admin();
    if (folderId) {
      const { data: folder, error } = await db.from("ctt_folders")
        .select("id").eq("id", folderId).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!folder) throw new HttpError("Folder not found.", 404);
    }
    const { data, error } = await db.from("ctt_jobs")
      .update({ folder_id: folderId }).eq("id", id).eq("user_id", user.id)
      .select("id,folder_id").maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError("Extraction not found.", 404);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
