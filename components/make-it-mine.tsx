"use client";
import { useEffect, useState, useRef } from "react";
import SendToI7OS from "./send-to-i7os";
import { tones, toneLabel } from "@/lib/tones";
type Version = {
  id: string;
  angle: string;
  title: string | null;
  slides: { position: number; text: string }[];
  created_at: string;
};
export default function MakeItMine({
  jobId,
  onReady,
}: {
  jobId: string;
  onReady: () => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]),
    [angle, setAngle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [opened, setOpened] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const r = await fetch(`/api/jobs/${jobId}/rewrite`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error("Could not load your versions.");
        const data = await r.json();
        if (stopped || lock.current) return;
        setVersions(data.versions || []);
        const running =
          data.status === "generating" &&
          Date.parse(data.lease_until) > Date.now();
        setBusy(running);
        if (running) timer = setTimeout(load, 2500);
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    }
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId]);
  async function generate() {
    if (lock.current || busy) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/jobs/${jobId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || "Could not create your version.");
      setVersions((old) => [v, ...old.filter((x) => x.id !== v.id)]);
      setOpened(v.id);
      onReady();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="make-it-mine">
      <div className="adapt-controls">
        <label className="tone-label" htmlFor={`angle-${jobId}`}>
          Tone
        </label>
        <select
          id={`angle-${jobId}`}
          value={angle}
          onChange={(e) => setAngle(e.target.value)}
          disabled={busy}
        >
          {tones.map((t) => (
            <option key={t.label} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          className="secondary make-mine-button"
          onClick={generate}
          disabled={busy}
        >
          {busy
            ? "Creating your version…"
            : versions.length
              ? "Create another version"
              : "Adapt"}
        </button>
      </div>
      {busy && (
        <p className="extraction-loading" role="status">
          <span className="loader loader-reading" aria-hidden="true" />
          <span className="processing-shimmer">Creating your version…</span>
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {versions.map((v) => (
        <SavedVersion
          key={v.id}
          version={v}
          jobId={jobId}
          initiallyOpen={opened === v.id}
          onDeleted={() =>
            setVersions((old) => old.filter((x) => x.id !== v.id))
          }
        />
      ))}
    </div>
  );
}
function SavedVersion({
  version,
  jobId,
  initiallyOpen,
  onDeleted,
}: {
  version: Version;
  jobId: string;
  initiallyOpen: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen),
    [copied, setCopied] = useState(""),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const lock = useRef(false);
  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Could not copy. Please select the text directly.");
    }
  }
  async function remove() {
    if (lock.current) return;
    lock.current = true;
    setDeleting(true);
    setError("");
    try {
      const r = await fetch(`/api/jobs/${jobId}/rewrite/${version.id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error || "Could not delete your version.");
      }
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setDeleting(false);
    }
  }
  return (
    <details
      className="version-section"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Your version{" "}
        <span className="tone-chip">{toneLabel(version.angle)}</span>
        <span className="chevron version-chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="m6 9 6 6 6-6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </summary>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {version.title && (
        <article className="slide">
          <div className="section-title">
            <small className="slide-label">Title</small>
            <button
              className="text-button"
              onClick={() => copy(version.title || "", "title")}
            >
              {copied === "title" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre>{version.title}</pre>
        </article>
      )}
      {version.slides.map((s) => (
        <article className="slide" key={s.position}>
          <div className="section-title">
            <small className="slide-label">
              Slide {String(s.position).padStart(2, "0")}
            </small>
            <button
              className="text-button"
              onClick={() => copy(s.text, String(s.position))}
            >
              {copied === String(s.position) ? "Copied" : "Copy"}
            </button>
          </div>
          <pre>{s.text}</pre>
        </article>
      ))}
      {!!version.slides.length && (
        <div className="export-actions">
          <button
            className="secondary"
            onClick={() =>
              copy(
                [
                  version.title || "",
                  version.slides
                    .map((s) => `Slide ${s.position}\n${s.text}`)
                    .join("\n\n"),
                ]
                  .filter(Boolean)
                  .join("\n\n"),
                "all",
              )
            }
          >
            {copied === "all" ? "Copied" : "Copy all text"}
          </button>
          <SendToI7OS
            key={version.id}
            jobId={jobId}
            version="mine"
            versionId={version.id}
          />
          <button className="text-button" disabled={deleting} onClick={remove}>
            {deleting ? "Deleting…" : "Delete version"}
          </button>
          {["md", "txt", "json"].map((f) => (
            <a
              className="text-button"
              key={f}
              href={`/api/jobs/${jobId}/export?format=${f}&version=mine&versionId=${version.id}`}
            >
              {f === "md" ? "Markdown" : f.toUpperCase()} ↓
            </a>
          ))}
        </div>
      )}
    </details>
  );
}
