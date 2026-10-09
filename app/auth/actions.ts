"use server";
import { redirect } from "next/navigation";
import { sessionClient, configured } from "@/lib/server";
export async function authenticate(form: FormData) {
  if (!configured())
    redirect(
      "/login?message=" +
        encodeURIComponent("Supabase ist noch nicht eingerichtet."),
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
        encodeURIComponent("E-Mail und Passwort prüfen (8–128 Zeichen)."),
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
            "Registrierung nicht möglich. Bitte Angaben prüfen oder später erneut versuchen.",
          ),
      );
    if (!data.session)
      redirect(
        "/login?message=" +
          encodeURIComponent(
            "Bitte bestätige deine E-Mail über den zugeschickten Link.",
          ),
      );
  } else {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error)
      redirect(
        "/login?message=" +
          encodeURIComponent(
            "Anmeldung fehlgeschlagen. Zugangsdaten und E-Mail-Bestätigung prüfen.",
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
