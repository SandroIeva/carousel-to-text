"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { terminal, type Job } from "@/lib/types";
const labels: Record<Job["status"], string> = {
  queued: "Queued",
  scraping: "Loading slides",
  processing: "Reading text",
  completed: "Completed",
  partial: "Partial",
  failed: "Failed",
};
export default function Dashboard({
  initial,
  email,
  used,
  limit,
  ready,
  initialError,
  guest = false,
}: {
  initial: Job[];
  email: string;
  used: number;
  limit: number;
  ready: boolean;
  initialError: string;
  guest?: boolean;
}) {
  const [jobs, setJobs] = useState<Job[]>(initial),
    [url, setUrl] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(initial[0]?.id || null),
    [copied, setCopied] = useState(false),
    [count, setCount] = useState(used);
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    if (!guest) {
      const saved = sessionStorage.getItem("carousel-url");
      if (saved) {
        setUrl(saved);
        sessionStorage.removeItem("carousel-url");
      }
    }
  }, [guest]);
  const active = jobs.some((j) => !terminal(j.status));
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const r = await fetch("/api/jobs", { cache: "no-store" });
        if (!r.ok) throw new Error("Could not refresh your history.");
        const all: Job[] = await r.json();
        if (stopped) return;
        setJobs(all);
        const job = all.find((j) => !terminal(j.status));
        if (job) {
          const step = await fetch(`/api/jobs/${job.id}/step`, {
            method: "POST",
          });
          if (!step.ok) {
            const b = await step.json();
            throw new Error(b.error);
          }
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      } finally {
        if (!stopped) timer = setTimeout(tick, 2500);
      }
    }
    timer = setTimeout(tick, 100);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active]);
  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (guest) {
      sessionStorage.setItem("carousel-url", url);
      window.location.assign("/dashboard");
      return;
    }
    setBusy(true);
    setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, requestId: requestId.current }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      const history = await fetch("/api/jobs", { cache: "no-store" });
      if (!history.ok)
        throw new Error("Extraction created. Please reload your history.");
      const all: Job[] = await history.json();
      setJobs(all);
      setSelected(b.id);
      setCount((c) => c + 1);
      setUrl("");
      requestId.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!confirm("Permanently delete this extraction and its text?")) return;
    const r = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    if (r.ok) {
      setJobs((j) => j.filter((x) => x.id !== id));
      if (selected === id) setSelected(null);
    } else setError("Could not delete. Please try again.");
  }
  const job = jobs.find((j) => j.id === selected);
  async function copyText() {
    if (!job) return;
    try {
      await navigator.clipboard.writeText(
        job.slides
          .map((s) => `Slide ${s.position}\n${s.text || s.error || ""}`)
          .join("\n\n"),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Please select the text directly.");
    }
  }
  return (
    <main className="simple-app">
      <header className="topbar">
        <Link href="/" className="brand">
          Slide Scrape
        </Link>
        {guest ? (
          <Link href="/dashboard" className="text-button">
            Sign in
          </Link>
        ) : (
          <form action={signOut}>
            <button className="text-button" title={email}>
              Sign out
            </button>
          </form>
        )}
      </header>
      <section className="composer">
        <h1>Carousel in. Text out.</h1>
        <p>Paste an Instagram link. Get the text, slide by slide.</p>
        <form onSubmit={start}>
          <label htmlFor="instagram" className="sr-only">
            Instagram link
          </label>
          <div className="input-row">
            <input
              id="instagram"
              type="url"
              required
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                requestId.current = null;
              }}
              placeholder="https://www.instagram.com/p/…"
            />
            <button disabled={busy || (!guest && (!ready || count >= limit))}>
              {busy ? "Starting…" : "Extract"}
            </button>
          </div>
        </form>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {!guest && !ready && (
          <p className="notice">Extraction is not set up yet.</p>
        )}
        {!guest && count >= limit && (
          <p className="notice">You have reached your monthly limit.</p>
        )}
      </section>
      {job && (
        <section className="result" aria-label="Extracted text">
          <div className="section-title">
            <h2>Your text</h2>
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="subtle-link"
            >
              View original ↗
            </a>
          </div>
          {!terminal(job.status) && (
            <p role="status">
              {labels[job.status]}…{" "}
              {job.slides.length > 0 &&
                `${job.slides.filter((s) => s.status !== "pending").length} / ${job.slides.length} Slides`}
            </p>
          )}
          {job.error && <p className="notice">{job.error}</p>}
          {job.slides.map((s) => (
            <article className="slide" key={s.position}>
              <small className="slide-label">
                Slide {String(s.position).padStart(2, "0")}
              </small>
              <pre>{s.text || s.error || "Processing…"}</pre>
            </article>
          ))}
          {terminal(job.status) && (
            <div className="export-actions">
              <button className="secondary" onClick={copyText}>
                {copied ? "Copied" : "Copy text"}
              </button>
              {["md", "txt", "json"].map((f) => (
                <a
                  className="text-button"
                  key={f}
                  href={`/api/jobs/${job.id}/export?format=${f}`}
                >
                  {f === "md" ? "Markdown" : f.toUpperCase()} ↓
                </a>
              ))}
              <button
                className="text-button danger"
                onClick={() => remove(job.id)}
              >
                Delete
              </button>
            </div>
          )}
          {job.caption && (
            <details className="caption">
              <summary>Original caption</summary>
              <pre>{job.caption}</pre>
            </details>
          )}
        </section>
      )}
      {!guest && jobs.length > 0 && (
        <details className="history">
          <summary>Previous extractions ({jobs.length})</summary>
          <div className="job-list">
            {jobs.map((j) => (
              <button
                key={j.id}
                className={"job-row " + (selected === j.id ? "selected" : "")}
                onClick={() => {
                  setSelected(j.id);
                  setCopied(false);
                }}
              >
                <span className="job-name">
                  {j.owner ? "@" + j.owner : "Instagram Carousel"}
                  <small>{j.url}</small>
                </span>
                <small>{labels[j.status]}</small>
              </button>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
