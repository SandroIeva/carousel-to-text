"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { terminal, type Job } from "@/lib/types";
const labels: Record<Job["status"], string> = {
  queued: "Wartet",
  scraping: "Slides laden",
  processing: "Text erkennen",
  completed: "Abgeschlossen",
  partial: "Teilweise",
  failed: "Fehlgeschlagen",
};
export default function Dashboard({
  initial,
  email,
  used,
  limit,
  ready,
  initialError,
}: {
  initial: Job[];
  email: string;
  used: number;
  limit: number;
  ready: boolean;
  initialError: string;
}) {
  const [jobs, setJobs] = useState<Job[]>(initial),
    [url, setUrl] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(initial[0]?.id || null),
    [search, setSearch] = useState(""),
    [count, setCount] = useState(used);
  const requestId = useRef<string | null>(null);
  const active = jobs.some((j) => !terminal(j.status));
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const r = await fetch("/api/jobs", { cache: "no-store" });
        if (!r.ok) throw new Error("Verlauf konnte nicht aktualisiert werden.");
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
        throw new Error("Extraktion angelegt; Verlauf bitte neu laden.");
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
    if (!confirm("Extraktion und Texte dauerhaft löschen?")) return;
    const r = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    if (r.ok) {
      setJobs((j) => j.filter((x) => x.id !== id));
      if (selected === id) setSelected(null);
    } else setError("Löschen nicht möglich. Bitte erneut versuchen.");
  }
  const job = jobs.find((j) => j.id === selected);
  const filtered = jobs.filter((j) =>
    (j.owner + " " + j.url + " " + j.caption)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="workspace">
      <aside>
        <Link href="/" className="brand">
          ▤ SlideScript
        </Link>
        <span className="sidebar-label">WORKSPACE</span>
        <a href="/dashboard" className="nav-active">
          ▦ Übersicht
        </a>
        <a href="#history">◷ Extraktionsverlauf</a>
        <div className="usage">
          <span className="tag">DEINE NUTZUNG</span>
          <h3>
            {count} <span>/ {limit}</span>
          </h3>
          <progress value={Math.min(count, limit)} max={Math.max(limit, 1)} />
          <small>
            Extraktionen diesen Monat · UTC
            <br />
            Fehlversuche zählen mit.
          </small>
        </div>
        <div className="account">
          <small>{email}</small>
          <form action={signOut}>
            <button className="text-button">Abmelden ↗</button>
          </form>
        </div>
      </aside>
      <main className="dashboard">
        <header>
          <span>Workspace / Übersicht</span>
          <span className="tag">CAROUSEL TO TEXT</span>
        </header>
        <div className="heading">
          <div>
            <span className="eyebrow">DEIN CONTENT, WEITERGEDACHT</span>
            <h1>Vom Slide zum Text.</h1>
            <p>Ein Instagram-Link genügt. Wir kümmern uns um den Rest.</p>
          </div>
          <span className="logo-mark">▤</span>
        </div>
        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
        {!ready && (
          <div className="notice">
            Extraktion noch nicht verfügbar: Server-Zugangsdaten müssen
            eingerichtet werden.
          </div>
        )}
        <section className="extract-card">
          <div className="section-title">
            <h2>Neue Extraktion</h2>
            <span>01 — LINK EINFÜGEN</span>
          </div>
          <form onSubmit={start}>
            <label htmlFor="instagram" className="sr-only">
              Instagram-Link
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
              <button disabled={busy || !ready || count >= limit}>
                {busy ? "Wird angelegt…" : "Text extrahieren ↗"}
              </button>
            </div>
          </form>
          <small>
            Öffentliche Posts · Bis zu 25 Slides · Originalsprache bleibt
            erhalten
          </small>
        </section>
        <div className="stats">
          <section>
            <span>EXTRAKTIONEN</span>
            <h2>{jobs.length}</h2>
            <small>Im geladenen Verlauf</small>
          </section>
          <section>
            <span>TRANSKRIBIERTE SLIDES</span>
            <h2>
              {jobs.reduce(
                (n, j) =>
                  n + j.slides.filter((s) => s.status === "completed").length,
                0,
              )}
            </h2>
            <small>Bereit zum Weiterverwenden</small>
          </section>
          <section>
            <span>EXPORTFORMATE</span>
            <h2>
              3 <em>↗</em>
            </h2>
            <small>Markdown, TXT und JSON</small>
          </section>
        </div>
        <section id="history" className="history">
          <div className="section-title">
            <h2>Deine Extraktionen</h2>
            <input
              aria-label="Verlauf durchsuchen"
              placeholder="Verlauf durchsuchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {!filtered.length ? (
            <div className="empty">
              <span>▤</span>
              <h3>
                {search
                  ? "Keine passenden Extraktionen"
                  : "Dein nächster Gedanke beginnt hier."}
              </h3>
              <p>
                Füge oben einen Carousel-Link ein. Deine Ergebnisse erscheinen
                hier.
              </p>
            </div>
          ) : (
            <div className="job-list">
              {filtered.map((j) => (
                <button
                  key={j.id}
                  className={"job-row " + (selected === j.id ? "selected" : "")}
                  onClick={() => setSelected(j.id)}
                >
                  <span className="job-icon">▤</span>
                  <span className="job-name">
                    <b>{j.owner ? "@" + j.owner : "Instagram Carousel"}</b>
                    <small>{j.url}</small>
                  </span>
                  <span className={"badge " + j.status}>
                    {labels[j.status]}
                  </span>
                  <span className="job-date">
                    {new Date(j.created_at).toLocaleDateString("de-DE")}
                  </span>
                  <span>↗</span>
                </button>
              ))}
            </div>
          )}
        </section>
        {job && (
          <section className="result card">
            <div className="section-title">
              <div>
                <span className="eyebrow">ERGEBNIS</span>
                <h2>{job.owner ? "@" + job.owner : "Instagram Carousel"}</h2>
              </div>
              <span className={"badge " + job.status}>
                {labels[job.status]}
              </span>
            </div>
            <a href={job.url} target="_blank" rel="noreferrer">
              Original öffnen ↗
            </a>
            {!terminal(job.status) && (
              <p role="status">
                {labels[job.status]} ·{" "}
                {job.slides.filter((s) => s.status !== "pending").length} /{" "}
                {job.slides.length || "?"} Slides. Dieses Fenster kann die
                Verarbeitung fortsetzen.
              </p>
            )}
            {job.error && <div className="notice">{job.error}</div>}
            {terminal(job.status) && (
              <div className="export-actions">
                {["md", "txt", "json"].map((f) => (
                  <a
                    className="button secondary"
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
                  Löschen
                </button>
              </div>
            )}
            {job.slides.map((s) => (
              <article className="slide" key={s.position}>
                <div className="section-title">
                  <h3>Slide {String(s.position).padStart(2, "0")}</h3>
                  <small>
                    {s.status === "completed"
                      ? "Transkribiert"
                      : s.status === "pending"
                        ? "Wartet"
                        : s.kind === "video"
                          ? "Video"
                          : "Fehler"}
                  </small>
                </div>
                <pre>{s.text || s.error || "Wird verarbeitet…"}</pre>
              </article>
            ))}
            {job.caption && (
              <article className="slide">
                <h3>Original Caption</h3>
                <pre>{job.caption}</pre>
              </article>
            )}
            <small>
              Bitte Zahlen und unlesbare Stellen am Original prüfen.
              KI-Texterkennung kann Fehler enthalten.
            </small>
          </section>
        )}
        <footer>SlideScript · Deine Inhalte bleiben in deinem Konto.</footer>
      </main>
    </div>
  );
}
