import {
  identity,
  admin,
  sameOrigin,
  errorResponse,
  HttpError,
} from "@/lib/server";
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    sameOrigin(req);
    const { user } = await identity();
    const { id, versionId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(versionId))
      throw new HttpError("Invalid version.");
    const result = await admin().rpc("ctt_delete_rewrite_version", {
      p_user: user.id,
      p_job: id,
      p_version: versionId,
    });
    if (result.error) throw result.error;
    if (!result.data) throw new HttpError("Not found.", 404);
    return Response.json(
      { deleted: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
