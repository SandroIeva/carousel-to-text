"use server";
import { redirect } from "next/navigation";
import { sessionClient, configured } from "@/lib/server";
export async function authenticate(form: FormData) {
  if (!configured())
    redirect(
      "/login?message=" + encodeURIComponent("Supabase is not set up yet."),
    );
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const mode = form.get("mode");
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    password.length < 8 ||
    password.length > 128
  )
    redirect(
      "/login?message=" +
        encodeURIComponent("Check your email and password (8–128 characters)."),
    );
  const db = await sessionClient();
  if (mode === "signup") {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${process.env.APP_URL}/auth/callback` },
    });
    if (error)
      redirect(
        "/login?message=" +
          encodeURIComponent(
            "Could not create your account. Check your details or try again later.",
          ),
      );
    if (!data.session)
      redirect(
        "/login?message=" +
          encodeURIComponent(
            "Please confirm your email using the link we sent you.",
          ),
      );
  } else {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error)
      redirect(
        "/login?message=" +
          encodeURIComponent(
            "Sign in failed. Check your credentials and email confirmation.",
          ),
      );
  }
  redirect("/dashboard");
}
export async function signOut() {
  const db = await sessionClient();
  await db.auth.signOut();
  redirect("/login");
}
