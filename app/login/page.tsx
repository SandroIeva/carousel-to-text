import Link from "next/link";
import { authenticate } from "../auth/actions";
import { configured } from "@/lib/server";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  return (
    <main className="auth">
      <Link href="/" className="brand">
        ▤ SlideScript
      </Link>
      <section className="card">
        <span className="eyebrow">WILLKOMMEN</span>
        <h1>Dein Text-Workspace.</h1>
        <p>Melde dich an oder erstelle dein Konto.</p>
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
        {!configured() && (
          <div className="notice">
            Supabase-Konfiguration fehlt. Der Login wird nach Einrichtung
            verfügbar.
          </div>
        )}
        <form action={authenticate}>
          <label>
            E-Mail
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="du@unternehmen.de"
            />
          </label>
          <label>
            Passwort
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              maxLength={128}
              required
              placeholder="Mindestens 8 Zeichen"
            />
          </label>
          <button name="mode" value="login" disabled={!configured()}>
            Anmelden →
          </button>
          <button
            name="mode"
            value="signup"
            className="secondary"
            disabled={!configured()}
          >
            Konto erstellen
          </button>
        </form>
        <small>
          Bei der Registrierung erhältst du gegebenenfalls einen
          Bestätigungslink per E-Mail.
        </small>
      </section>
    </main>
  );
}
