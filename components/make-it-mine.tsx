"use client";
import { useEffect, useState } from "react";
const tones = [
  { label: "Natural", value: "" },
  {
    label: "Casual",
    value: "Use a casual, conversational tone with simple everyday language.",
  },
  {
    label: "Professional",
    value: "Use a professional, serious and clear tone without slang.",
  },
  {
    label: "Bold",
    value:
      "Use a bold, direct and confident tone without exaggerating factual claims.",
  },
  { label: "Friendly", value: "Use a warm, friendly and approachable tone." },
];
type Version = {
  status: "generating" | "ready" | "failed";
  angle: string;
  slides: { position: number; text: string }[];
  error: string | null;
  lease_until?: string;
};
export default function MakeItMine({
  jobId,
  onReady,
}: {
  jobId: string;
  onReady: () => void;
}) {
  const [version, setVersion] = useState<Version | null>(null),
    [angle, setAngle] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState("");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const r = await fetch(`/api/jobs/${jobId}/rewrite`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error("Could not load your saved version.");
        const v: Version | null = await r.json();
        if (stopped) return;
        setVersion(v);
        if (v) setAngle(tones.some((t) => t.value === v.angle) ? v.angle : "");
        const running =
          v?.status === "generating" &&
          !!v.lease_until &&
          Date.parse(v.lease_until) > Date.now();
        setBusy(!!running);
        if (running) timer = setTimeout(load, 2500);
        if (v?.status === "generating" && !running)
          setError("Generation was interrupted. You can try again.");
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
    if (busy) return;
    setBusy(true);
    setOpen(true);
    setError("");
    try {
      const r = await fetch(`/api/jobs/${jobId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || "Could not create your version.");
      setVersion(v);
      onReady();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Could not copy. Please select the text directly.");
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
          {tones.map((tone) => (
            <option key={tone.label} value={tone.value}>
              {tone.label}
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
            : version?.slides.length
              ? "Regenerate"
              : "Make it mine"}
        </button>
      </div>
      {(version || busy || error) && (
        <details
          className="version-section"
          open={open}
          onToggle={(e) => setOpen(e.currentTarget.open)}
        >
          <summary>
            Your version{" "}
            <span className="chevron version-chevron" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </summary>
          {busy && (
            <p className="extraction-loading" role="status">
              <span className="loader loader-reading" aria-hidden="true" />
              <span className="processing-shimmer">Creating your version…</span>
            </p>
          )}
          {(error || version?.error) && (
            <p className="notice" role="alert">
              {error || version?.error}
            </p>
          )}
          {version?.slides.map((s) => (
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
          {!!version?.slides.length && (
            <div className="export-actions">
              <button
                className="secondary"
                onClick={() =>
                  copy(
                    version.slides
                      .map((s) => `Slide ${s.position}\n${s.text}`)
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
                  href={`/api/jobs/${jobId}/export?format=${f}&version=mine`}
                >
                  {f === "md" ? "Markdown" : f.toUpperCase()} ↓
                </a>
              ))}
            </div>
          )}
        </details>
      )}
    </div>
  );
}
