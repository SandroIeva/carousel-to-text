import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
export function configured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
export async function sessionClient() {
  if (!configured()) throw new Error("Supabase is not configured yet.");
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (all) => {
          try {
            all.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server components: proxy refreshes cookies. */
          }
        },
      },
    },
  );
}
export function admin() {
  if (!process.env.SUPABASE_SECRET_KEY)
    throw new Error("Server configuration is missing.");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function identity() {
  const db = await sessionClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new HttpError("Please sign in.", 401);
  return { db, user: data.user };
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(process.env.APP_URL!).origin)
    throw new HttpError("Request not allowed.", 403);
}
export function errorResponse(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "Could not process the request.",
    },
    {
      status: error instanceof HttpError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export function integrationsReady() {
  return !!(
    process.env.APIFY_TOKEN &&
    process.env.GEMINI_API_KEY &&
    process.env.SUPABASE_SECRET_KEY
  );
}
