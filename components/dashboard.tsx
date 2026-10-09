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
    [newJobId, setNewJobId] = useState<string | null>(null),
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
      setNewJobId(b.id);
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
      if (newJobId === id) setNewJobId(null);
    } else setError("Could not delete. Please try again.");
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
      {!guest && jobs.length > 0 && (
        <section className="extraction-list" aria-label="Saved extractions">
          {jobs.map((job) => (
            <SavedExtraction
              key={job.id}
              job={job}
              initiallyOpen={job.id === newJobId}
              onDelete={remove}
              onError={setError}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function extractionTitle(job: Job) {
  const caption = job.caption
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return caption
    ? caption.length > 100
      ? caption.slice(0, 100) + "…"
      : caption
    : job.owner
      ? `@${job.owner}`
      : "Instagram carousel";
}

function SavedExtraction({
  job,
  initiallyOpen,
  onDelete,
  onError,
}: {
  job: Job;
  initiallyOpen: boolean;
  onDelete: (id: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(initiallyOpen);
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      onError("Could not copy. Please select the text directly.");
    }
  }
  return (
    <details
      className="saved-extraction"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="extraction-summary">
        <span className="extraction-title">
          {extractionTitle(job)}
          <small>
            {job.owner ? `@${job.owner} · ` : ""}
            {new Date(job.created_at).toLocaleDateString("en-GB")} ·{" "}
            {job.slides.length} slides
          </small>
        </span>
        <small className="extraction-status">{labels[job.status]}</small>
        <span className="chevron" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="extraction-content">
        <a
          href={job.url}
          target="_blank"
          rel="noreferrer"
          className="subtle-link"
        >
          View original ↗
        </a>
        {!terminal(job.status) && (
          <p role="status">
            {labels[job.status]}…{" "}
            {job.slides.filter((s) => s.status !== "pending").length} /{" "}
            {job.slides.length || "?"} slides
          </p>
        )}
        {job.error && <p className="notice">{job.error}</p>}
        {job.slides.map((s) => (
          <article className="slide" key={s.position}>
            <div className="section-title">
              <small className="slide-label">
                Slide {String(s.position).padStart(2, "0")}
              </small>
              {s.status === "completed" && (
                <button
                  className="text-button"
                  onClick={() => copy(s.text, String(s.position))}
                >
                  {copied === String(s.position) ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <pre>{s.text || s.error || "Processing…"}</pre>
          </article>
        ))}
        {terminal(job.status) && (
          <div className="export-actions">
            <button
              className="secondary"
              onClick={() =>
                copy(
                  job.slides
                    .map(
                      (s) => `Slide ${s.position}\n${s.text || s.error || ""}`,
                    )
                    .join("\n\n"),
                  "all",
                )
              }
            >
              {copied === "all" ? "Copied" : "Copy all text"}
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
              onClick={() => onDelete(job.id)}
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
      </div>
    </details>
  );
}
