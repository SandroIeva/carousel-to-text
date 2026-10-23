import { admin, errorResponse, HttpError, identity, sameOrigin } from "@/lib/server";
import { folderName, isUuid } from "@/lib/folders";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  try {
    sameOrigin(req);
    const { user } = await identity();
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError("Invalid folder ID.");
    const text = await req.text();
    if (text.length > 512) throw new HttpError("Folder name is too long.", 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new HttpError("Invalid request."); }
    const name = folderName((body as { name?: unknown } | null)?.name);
    if (!name) throw new HttpError("Enter a folder name (up to 60 characters).");
    const { data, error } = await admin().from("ctt_folders")
      .update({ name }).eq("id", id).eq("user_id", user.id)
      .select("id,user_id,name,created_at").maybeSingle();
    if (error?.code === "23505") throw new HttpError("A folder with that name already exists.", 409);
    if (error) throw error;
    if (!data) throw new HttpError("Folder not found.", 404);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(req: Request, { params }: Context) {
  try {
    sameOrigin(req);
    const { user } = await identity();
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError("Invalid folder ID.");
    const { data, error } = await admin().from("ctt_folders")
      .delete().eq("id", id).eq("user_id", user.id).select("id");
    if (error) throw error;
    if (!data?.length) throw new HttpError("Folder not found.", 404);
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
