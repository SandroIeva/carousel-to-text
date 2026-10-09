import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/server";
export async function GET(req: Request) {
  const u = new URL(req.url);
  const hash = u.searchParams.get("token_hash");
  if (hash && u.searchParams.get("type") === "email") {
    const db = await sessionClient();
    const { error } = await db.auth.verifyOtp({
      token_hash: hash,
      type: "email",
    });
    if (!error)
      return NextResponse.redirect(new URL("/dashboard", process.env.APP_URL));
  }
  return NextResponse.redirect(
    new URL(
      "/login?message=Confirmation+link+is+invalid+or+expired.",
      process.env.APP_URL,
    ),
  );
}
