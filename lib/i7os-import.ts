import "server-only";
import { HttpError } from "./server";
export type I7Workspace = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  canWrite: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function i7Base() {
  const base = new URL(process.env.I7OS_APP_URL || "https://app.i7os.com");
  if (base.protocol !== "https:" || base.username || base.password || base.port)
    throw new HttpError("i7OS is not configured correctly.", 503);
  return base;
}
export async function i7Import(
  token: string,
  key: string,
  payload: Record<string, unknown>,
) {
  let response: Response;
  try {
    response = await fetch(new URL("/api/slidescrape-import", i7Base()), {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${token}`,
        "X-SlideScrape-Public-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new HttpError(
      payload.mode === "document"
        ? "Could not confirm the import. Check i7OS before trying again."
        : "Could not load your i7OS workspaces. Please try again.",
      503,
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new HttpError("i7OS returned an unexpected response.", 503);
  }
  if (!response.ok) {
    const message =
      response.status === 401
        ? "Please sign in again with a confirmed email address."
        : data.code === "read_only"
          ? "This workspace has no active i7OS subscription."
          : data.code === "not_a_member"
            ? "You do not have access to this workspace."
            : data.code === "empty"
              ? "There is no readable text to import."
              : "i7OS is temporarily unavailable. Please try again later.";
    throw new HttpError(
      message,
      [400, 401, 403].includes(response.status) ? response.status : 503,
    );
  }
  if (payload.mode === "workspaces") {
    if (!Array.isArray(data.workspaces) || data.workspaces.length > 500)
      throw new HttpError("i7OS returned an invalid workspace list.", 503);
    const workspaces: I7Workspace[] = data.workspaces.map((w: I7Workspace) => {
      if (
        !w ||
        !uuid.test(w.id) ||
        typeof w.name !== "string" ||
        typeof w.slug !== "string" ||
        typeof w.canWrite !== "boolean" ||
        typeof w.plan !== "string"
      )
        throw new HttpError("i7OS returned an invalid workspace list.", 503);
      return {
        id: w.id,
        name: w.name.slice(0, 200),
        slug: w.slug,
        plan: w.plan,
        canWrite: w.canWrite,
      };
    });
    return { workspaces };
  }
  let target: URL;
  try {
    target = new URL(data.url);
  } catch {
    throw new HttpError(
      "The document was sent, but i7OS returned an invalid link.",
      503,
    );
  }
  if (
    !uuid.test(data.id) ||
    target.origin !== i7Base().origin ||
    target.username ||
    target.password ||
    target.searchParams.get("doc") !== data.id ||
    data.workspace?.id !== payload.orgId ||
    typeof data.workspace?.name !== "string"
  )
    throw new HttpError(
      "The document was sent, but i7OS returned an invalid link.",
      503,
    );
  return {
    id: data.id,
    url: target.toString(),
    workspace: { id: data.workspace.id, name: data.workspace.name },
  };
}
