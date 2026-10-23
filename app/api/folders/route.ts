import { admin, errorResponse, HttpError, identity, sameOrigin } from "@/lib/server";
import { folderName } from "@/lib/folders";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { user } = await identity();
    const text = await req.text();
    if (text.length > 512) throw new HttpError("Folder name is too long.", 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new HttpError("Invalid request."); }
    const name = folderName((body as { name?: unknown } | null)?.name);
    if (!name) throw new HttpError("Enter a folder name (up to 60 characters).");
    const db = admin();
    const { count, error: countError } = await db.from("ctt_folders")
      .select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (countError) throw countError;
    if ((count || 0) >= 50) throw new HttpError("You can create up to 50 folders.", 409);
    const { data, error } = await db.from("ctt_folders")
      .insert({ user_id: user.id, name })
      .select("id,user_id,name,created_at").single();
    if (error?.code === "23505") throw new HttpError("A folder with that name already exists.", 409);
    if (error) throw error;
    return Response.json(data, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
