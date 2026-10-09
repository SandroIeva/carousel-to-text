import Link from "next/link";
import { authenticate, signInWithGoogle } from "../auth/actions";
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
        <span className="eyebrow">WELCOME</span>
        <h1>Sign in to SlideScript.</h1>
        <p>Sign in or create an account.</p>
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
        {!configured() && (
          <div className="notice">
            Sign in will be available once setup is complete.
          </div>
        )}
        <form action={signInWithGoogle}>
          <button className="secondary google-signin" disabled={!configured()}>
            Continue with Google
          </button>
        </form>
        <div className="auth-divider">or use email</div>
        <form action={authenticate}>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              maxLength={128}
              required
              placeholder="At least 8 characters"
            />
          </label>
          <button name="mode" value="login" disabled={!configured()}>
            Sign in →
          </button>
          <button
            name="mode"
            value="signup"
            className="secondary"
            disabled={!configured()}
          >
            Create account
          </button>
        </form>
        <small>
          You may receive an email confirmation link when you sign up.
        </small>
      </section>
    </main>
  );
}
