import { identity, sameOrigin, errorResponse, HttpError } from "@/lib/server";
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const { db } = await identity();
    const { id } = await params;
    const { data, error } = await db
      .from("ctt_jobs")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data?.length)
      throw new HttpError("Nicht gefunden oder noch in Verarbeitung.", 409);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
