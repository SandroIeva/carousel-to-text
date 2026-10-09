import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublicConfig, supabaseServerKey } from "./supabase-config";
export function configured() {
  const { url, key } = supabasePublicConfig();
  return !!(url && key);
}
export async function sessionClient() {
  if (!configured()) throw new Error("Supabase is not configured yet.");
  const { url, key } = supabasePublicConfig();
  const jar = await cookies();
  return createServerClient(url!, key!, {
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
  });
}
export function admin() {
  const { url } = supabasePublicConfig();
  const key = supabaseServerKey();
  if (!url || !key) throw new Error("Server configuration is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
  const allowed = new Set<string>();
  const candidates = [
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
        allowed.add(url.origin);
    } catch {
      /* Ignore malformed configuration; never trust request headers as configuration. */
    }
  }
  const origin = req.headers.get("origin");
  if (!origin || !allowed.has(origin)) {
    let browserOrigin = "missing Origin header";
    if (origin) {
      try {
        const parsed = new URL(origin);
        browserOrigin = ["http:", "https:"].includes(parsed.protocol)
          ? parsed.origin
          : "invalid Origin header";
      } catch {
        browserOrigin = "invalid Origin header";
      }
    }
    throw new HttpError(
      `Request not allowed. Browser origin: ${browserOrigin}. Configured app origins: ${[...allowed].join(", ") || "none (APP_URL or Vercel system variables missing/invalid)"}.`,
      403,
    );
  }
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
    supabaseServerKey()
  );
}
