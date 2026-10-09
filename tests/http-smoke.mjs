import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3100";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "-p",
    "3100",
    "--hostname",
    "127.0.0.1",
  ],
  { env: { ...process.env, APP_URL: base }, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
child.stdout.on("data", (b) => (logs += b));
child.stderr.on("data", (b) => (logs += b));
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, logs);
  const home = await fetch(base);
  assert.match(await home.text(), /Carousel in/);
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  const login = await fetch(base + "/login");
  const loginHtml = await login.text();
  assert.match(loginHtml, /Sign in to Slide Scrape/);
  assert.match(loginHtml, /Continue with Google/);
  const cancelledOAuth = await fetch(base + "/auth/callback?error=access_denied&error_description=untrusted", { redirect: "manual" });
  assert.equal(cancelledOAuth.status, 307);
  assert.equal(new URL(cancelledOAuth.headers.get("location")).origin, base);
  assert.equal(new URL(cancelledOAuth.headers.get("location")).pathname, "/login");
  assert.ok(!cancelledOAuth.headers.get("location").includes("untrusted"));
  const dashboard = await fetch(base + "/dashboard", { redirect: "manual" });
  assert.equal(dashboard.status, 307);
  assert.match(dashboard.headers.get("location"), /login/);
  const jobs = await fetch(base + "/api/jobs");
  assert.ok([401, 503].includes(jobs.status));
  assert.match(jobs.headers.get("cache-control"), /no-store/);
  assert.equal((await fetch(base + "/api/cron")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/jobs", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  console.log(
    "HTTP smoke: landing/login, dashboard protection, API protection, cache, CSRF and cron passed",
  );
} finally {
  child.kill("SIGTERM");
}
