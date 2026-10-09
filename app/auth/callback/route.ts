import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/server";
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (code) {
    const db = await sessionClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/dashboard", process.env.APP_URL));
  }
  return NextResponse.redirect(
    new URL(
      "/login?message=Bestätigungslink+ungültig+oder+abgelaufen.",
      process.env.APP_URL,
    ),
  );
}
