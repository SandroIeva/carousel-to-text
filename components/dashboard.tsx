"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { terminal, type Folder, type Job } from "@/lib/types";
import { platformFor, platformLabel } from "@/lib/core";
import { DAILY_LIMIT } from "@/lib/daily-limit";
import { hasSavedContent, showExtraction } from "@/lib/history";
import { isRetryableGeminiFailure } from "@/lib/retry-failed-slides";
import UpgradePreview from "./upgrade-preview";
import MakeItMine from "./make-it-mine";
import I7Benefits from "./i7-benefits";
import SendToI7OS from "./send-to-i7os";
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
  initialFolders = [],
  email,
  used,
  limit,
  ready,
  initialError,
  guest = false,
  avatarUrl = "",
  dailyUsed = 0,
  quotaExempt = false,
  dailyLimit = DAILY_LIMIT,
  i7Plan = "free",
  rewriteLimit = 3,
  freeScrapesUsed = 0,
}: {
  initial: Job[];
  initialFolders?: Folder[];
  email: string;
  used: number;
  limit: number;
  ready: boolean;
  initialError: string;
  guest?: boolean;
  avatarUrl?: string;
  dailyUsed?: number;
  quotaExempt?: boolean;
  dailyLimit?: number;
  i7Plan?: string;
  rewriteLimit?: number;
  freeScrapesUsed?: number;
}) {
  const [trialUsed,setTrialUsed] = useState(freeScrapesUsed);
  const trialEnded = !guest && !quotaExempt && i7Plan === "free" && trialUsed >= 5;
  const [upgradePreview, setUpgradePreview] = useState(false);
  const canPreviewUpgrade = quotaExempt && email.trim().toLowerCase() === "sandro.ieva@googlemail.com";
  const [jobs, setJobs] = useState<Job[]>(initial),
    [url, setUrl] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [newJobId, setNewJobId] = useState<string | null>(null),
    [count, setCount] = useState(used),
    [dailyCount, setDailyCount] = useState(dailyUsed);
  const requestId = useRef<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [folderForm, setFolderForm] = useState<"create" | "rename" | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const reported = useRef(new Set(initial.filter((job) => terminal(job.status)).map((job) => job.id)));
  const visibleJobs = jobs.filter(showExtraction);
  const filteredJobs = visibleJobs.filter((job) =>
    selectedFolder === "all" ||
    (selectedFolder === "unfiled" ? !job.folder_id : job.folder_id === selectedFolder),
  );
  const pageCount = Math.max(1, Math.ceil(filteredJobs.length / 10));
  const currentPage = Math.min(historyPage, pageCount);
  const pageJobs = filteredJobs.slice((currentPage - 1) * 10, currentPage * 10);
  useEffect(() => {
    setHistoryPage((page) => Math.min(page, pageCount));
  }, [pageCount]);
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
        for (const result of all) {
          if (terminal(result.status) && !reported.current.has(result.id)) {
            reported.current.add(result.id);
            if (!hasSavedContent(result)) {
              setError(result.error || "No readable content was found. Please try another post.");
            }
          }
        }
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
    if(trialEnded) {setUpgradePreview(true);return;}
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
      if (!r.ok) {if(b.code === "free_trial_exhausted") {setTrialUsed(5);setUpgradePreview(true);return;} throw new Error(b.error);}
      const history = await fetch("/api/jobs", { cache: "no-store" });
      if (!history.ok)
        throw new Error("Extraction created. Please reload your history.");
      const all: Job[] = await history.json();
      setJobs(all);
      setNewJobId(b.id);
      setSelectedFolder("all");
      setHistoryPage(1);
      setCount((c) => c + 1);
      setDailyCount((c) => c + 1);
      if(i7Plan === "free") setTrialUsed(c=>c+1);
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
  async function retry(id: string) {
    setError("");
    const response = await fetch(`/api/jobs/${id}/retry`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not retry this extraction.");
    const history = await fetch("/api/jobs", { cache: "no-store" });
    if (!history.ok) throw new Error("Retry started. Please reload your history.");
    setJobs(await history.json());
    setNewJobId(id);
    reported.current.delete(id);
  }
  function chooseFolder(id: string) {
    setSelectedFolder(id);
    setHistoryPage(1);
    setFolderForm(null);
    setFolderError("");
  }
  async function saveFolder(event: React.FormEvent) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    setFolderBusy(true);
    setFolderError("");
    try {
      const creating = folderForm === "create";
      const response = await fetch(creating ? "/api/folders" : `/api/folders/${selectedFolder}`, {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the folder.");
      if (creating) {
        setFolders((current) => [...current, result]);
        chooseFolder(result.id);
      } else {
        setFolders((current) => current.map((folder) => folder.id === result.id ? result : folder));
        setFolderForm(null);
      }
      setFolderName("");
    } catch (error) {
      setFolderError((error as Error).message);
    } finally {
      setFolderBusy(false);
    }
  }
  async function deleteFolder() {
    if (!confirm("Delete this folder? Its extractions will stay saved in Unfiled.")) return;
    setFolderBusy(true);
    setFolderError("");
    try {
      const response = await fetch(`/api/folders/${selectedFolder}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not delete the folder.");
      }
      setFolders((current) => current.filter((folder) => folder.id !== selectedFolder));
      setJobs((current) => current.map((job) => job.folder_id === selectedFolder ? { ...job, folder_id: null } : job));
      chooseFolder("unfiled");
    } catch (error) {
      setFolderError((error as Error).message);
    } finally {
      setFolderBusy(false);
    }
  }
  async function moveJob(jobId: string, folderId: string | null) {
    const response = await fetch(`/api/jobs/${jobId}/folder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not move the extraction.");
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, folder_id: result.folder_id } : job));
  }
  return (
    <main className="simple-app">
      {upgradePreview && <UpgradePreview adminPreview={canPreviewUpgrade} onClose={() => setUpgradePreview(false)} />}
      <header className="topbar">
        <Link href="https://www.slide-scrape.xyz" className="brand" onClick={canPreviewUpgrade ? (event) => { event.preventDefault(); setUpgradePreview(true); } : undefined}>
          Slide Scrape
        </Link>
        {guest ? (
          <Link href="/dashboard" className="text-button signin-link">
            Sign in
            <span className="signin-arrow" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </Link>
        ) : (
          <div className="account-controls">{i7Plan !== "free" && <I7Benefits plan={i7Plan} dailyLimit={dailyLimit} rewriteLimit={rewriteLimit} unlimited={quotaExempt}/>}<AccountDropdown email={email} avatarUrl={avatarUrl} /></div>
        )}
      </header>
      <section className="composer">
        <h1>Link in. Content out.</h1>
        <p>Paste an Instagram, LinkedIn or Threads link (carousels too). Get the content.</p>
        <form onSubmit={start}>
          <label htmlFor="instagram" className="sr-only">
            Post link
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
              placeholder="Paste a post link…"
            />
            <button
              className="extract-button"
              aria-label={busy ? "Starting extraction" : "Extract content"}
              title={busy ? "Starting…" : "Extract content"}
              disabled={
                busy ||
                (!guest &&
                  (!ready || (!trialEnded && !quotaExempt && (count >= limit || dailyCount >= dailyLimit))))
              }
            >
              {busy ? (
                <span className="extract-spinner" aria-hidden="true" />
              ) : (
                <svg
                  width="25"
                  height="25"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 12h14M12 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
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
        {!guest && !quotaExempt && !trialEnded && !error && dailyCount >= dailyLimit && (
          <p className="notice">
            Your daily limit of {dailyLimit} extractions has been reached. Try again after
            midnight (Europe/Berlin).
          </p>
        )}
        {!guest && !quotaExempt && !error && dailyCount < dailyLimit && count >= limit && (
          <p className="notice">You have reached your monthly limit.</p>
        )}
      </section>
      {!guest && (
        <div className="library-layout">
          <aside className="folder-sidebar" aria-label="Folders">
            <div className="folder-heading">
              <span>Folders</span>
              <button type="button" className="folder-create" aria-label="Create folder" title="Create folder" onClick={() => { setFolderForm("create"); setFolderName(""); setFolderError(""); }}>
                <span aria-hidden="true">+</span>
              </button>
            </div>
            <nav className="folder-nav" aria-label="Extraction folders">
              <button type="button" className={selectedFolder === "all" ? "active" : ""} aria-current={selectedFolder === "all" ? "page" : undefined} onClick={() => chooseFolder("all")}>All</button>
              <button type="button" className={selectedFolder === "unfiled" ? "active" : ""} aria-current={selectedFolder === "unfiled" ? "page" : undefined} onClick={() => chooseFolder("unfiled")}>Unfiled</button>
              {folders.map((folder) => (
                <button type="button" key={folder.id} className={selectedFolder === folder.id ? "active" : ""} aria-current={selectedFolder === folder.id ? "page" : undefined} onClick={() => chooseFolder(folder.id)} title={folder.name}>{folder.name}</button>
              ))}
            </nav>
            {folderForm && (
              <form className="folder-form" onSubmit={saveFolder}>
                <label className="sr-only" htmlFor="folder-name">Folder name</label>
                <input id="folder-name" autoFocus maxLength={60} placeholder="Folder name" value={folderName} onChange={(event) => setFolderName(event.target.value)} />
                <div className="folder-form-actions">
                  <button type="submit" disabled={folderBusy || !folderName.trim()}>{folderForm === "create" ? "Create" : "Save"}</button>
                  <button type="button" onClick={() => { setFolderForm(null); setFolderError(""); }}>Cancel</button>
                </div>
              </form>
            )}
            {selectedFolder !== "all" && selectedFolder !== "unfiled" && !folderForm && (
              <div className="folder-manage">
                <button type="button" onClick={() => { setFolderName(folders.find((folder) => folder.id === selectedFolder)?.name || ""); setFolderForm("rename"); }}>Rename</button>
                <button type="button" disabled={folderBusy} onClick={deleteFolder}>Delete</button>
              </div>
            )}
            {folderError && <p className="folder-error" role="alert">{folderError}</p>}
          </aside>
        <section className="extraction-list" aria-label="Saved extractions">
          {filteredJobs.length === 0 && (
            <p className="folder-empty">{selectedFolder === "all" ? "Your extractions will appear here." : "No extractions in this folder yet."}</p>
          )}
          {pageJobs.map((job) => (
            <SavedExtraction
              key={job.id}
              job={job}
              initiallyOpen={job.id === newJobId || !terminal(job.status)}
              onDelete={remove}
              onRetry={retry}
              onError={setError}
              folders={folders}
              onMove={moveJob}
            />
          ))}
          {pageCount > 1 && (
            <nav className="history-pagination" aria-label="Extraction history pages">
              <button className="text-button" disabled={currentPage === 1} onClick={() => setHistoryPage(currentPage - 1)} aria-label="Previous page">
                ← Previous
              </button>
              <span aria-live="polite">Page {currentPage} of {pageCount}</span>
              <button className="text-button" disabled={currentPage === pageCount} onClick={() => setHistoryPage(currentPage + 1)} aria-label="Next page">
                Next →
              </button>
            </nav>
          )}
        </section>
        </div>
      )}
    </main>
  );
}

function AccountDropdown({
  email,
  avatarUrl,
}: {
  email: string;
  avatarUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [failedImage, setFailedImage] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="account"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <button
        className="account-avatar"
        ref={trigger}
        type="button"
        aria-label="Account options"
        aria-expanded={open}
        aria-controls="account-dropdown"
        onClick={() => setOpen(!open)}
      >
        {avatarUrl && !failedImage ? (
          <img
            src={avatarUrl}
            alt=""
            width="40"
            height="40"
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(true)}
          />
        ) : (
          <span aria-hidden="true">
            {email.trim().charAt(0).toUpperCase() || "U"}
          </span>
        )}
      </button>
      {open && (
        <div className="account-dropdown" id="account-dropdown">
          <p className="account-email" title={email}>
            {email}
          </p>
          <form action={signOut}>
            <button className="account-signout">
              <span>Sign out</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9 5H5v14h4M10 12h10M16 8l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
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
      : platformFor(job.url) === "instagram"
        ? "Instagram carousel"
        : `${platformLabel(job.url)} post`;
}

function titleWithEmojiSpacing(title: string) {
  const segments = new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(title);
  return Array.from(segments, ({ segment }, index) =>
    /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(segment) ? (
      <span className="title-emoji" key={index}>
        {segment}
      </span>
    ) : (
      segment
    ),
  );
}

function SavedExtraction({
  job,
  initiallyOpen,
  onDelete,
  onRetry,
  onError,
  folders,
  onMove,
}: {
  job: Job;
  initiallyOpen: boolean;
  onDelete: (id: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
  onError: (message: string) => void;
  folders: Folder[];
  onMove: (jobId: string, folderId: string | null) => Promise<void>;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [moving, setMoving] = useState(false);
  const [open, setOpen] = useState(initiallyOpen);
  const [originalOpen, setOriginalOpen] = useState(!terminal(job.status));
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const desiredOpen = useRef(initiallyOpen);
  useEffect(() => () => { animationRef.current?.cancel(); }, []);
  function toggleSection(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    const details = detailsRef.current;
    const content = contentRef.current;
    if (!details || !content) return;
    const next = !desiredOpen.current;
    desiredOpen.current = next;
    const from = details.open ? content.getBoundingClientRect().height : 0;
    const opacity = details.open ? getComputedStyle(content).opacity : "0";
    const paddingBottom = details.open ? getComputedStyle(content).paddingBottom : "0px";
    animationRef.current?.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOpen(next);
      return;
    }
    details.open = true;
    setOpen(true);
    const animation = content.animate(
      [{ height: `${from}px`, opacity, paddingBottom }, { height: next ? `${content.scrollHeight}px` : "0px", opacity: next ? 1 : 0, paddingBottom: "0px" }],
      { duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    animationRef.current = animation;
    animation.onfinish = () => {
      if (animationRef.current !== animation) return;
      details.open = next;
      setOpen(next);
      animationRef.current = null;
    };
  }
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      onError("Could not copy. Please select the text directly.");
    }
  }
  async function retrySlides() {
    setRetrying(true);
    try {
      await onRetry(job.id);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setRetrying(false);
    }
  }
  async function moveTo(folderId: string) {
    setMoving(true);
    try {
      await onMove(job.id, folderId || null);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setMoving(false);
    }
  }
  return (
    <details
      ref={detailsRef}
      className="saved-extraction"
      open={open}
    >
      <summary className="extraction-summary" onClick={toggleSection}>
        <span className="extraction-title">
          {titleWithEmojiSpacing(extractionTitle(job))}
          <small>
            {platformLabel(job.url)} ·{" "}
            {job.owner
              ? `${platformFor(job.url) === "linkedin" ? "" : "@"}${job.owner} · `
              : ""}
            {new Date(job.created_at).toLocaleDateString("en-GB")} ·{" "}
            {job.slides.length} slides
          </small>
        </span>
        <small className="extraction-status">
          {(job.status === "completed" || job.status === "partial") && (
            <svg
              className={`completed-icon${job.status === "partial" ? " partial-icon" : ""}`}
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="m8 12 2.5 2.5L16 9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {job.status === "completed" || job.status === "partial" ? (
            <span className="sr-only">{labels[job.status]}</span>
          ) : job.status === "processing" ? (
            <>
              <span className="sr-only">Reading text</span>
            </>
          ) : (
            labels[job.status]
          )}
        </small>
        <span className="chevron" aria-hidden="true">
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
      <div className="extraction-content" ref={contentRef}>
        <div className="extraction-meta">
        <a
          href={job.url}
          target="_blank"
          rel="noreferrer"
          className="subtle-link"
        >
          View original ↗
        </a>
        <label className="folder-picker">
          <span>Folder</span>
          <select aria-label="Move extraction to folder" value={job.folder_id || ""} disabled={moving} onChange={(event) => moveTo(event.target.value)}>
            <option value="">Unfiled</option>
            {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
          </select>
        </label>
        </div>
        {!terminal(job.status) && (
          <div className="extraction-loading" role="status">
            <span className="loader loader-reading" aria-hidden="true" />
            <span>
            {job.status === "processing"
              ? `Reading slide ${Math.min(job.slides.filter((s) => s.status !== "pending").length + 1, job.slides.length)} of ${job.slides.length}`
              : `Loading ${platformLabel(job.url)} post…`}
            </span>
          </div>
        )}
        {job.error && <p className="notice">{job.error}</p>}
        {terminal(job.status) && job.slides.some(isRetryableGeminiFailure) && (
          <button className="secondary" disabled={retrying} onClick={retrySlides}>
            {retrying ? "Retrying…" : "Retry failed slides"}
          </button>
        )}
        {terminal(job.status) && job.slides.some(s => s.status === "completed" && s.text.trim()) && (
          <MakeItMine jobId={job.id} onReady={() => setOriginalOpen(false)} />
        )}
        <details className="version-section original-slides" open={originalOpen} onToggle={(e) => setOriginalOpen(e.currentTarget.open)}>
          <summary>Original slides <span className="chevron version-chevron" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span></summary>
        {job.slides.map((s) => (
          <article className="slide" key={s.position}>
            <div className="section-title">
              <small className="slide-label">
                {s.kind === "text"
                  ? "Post text"
                  : `Slide ${String(s.position).padStart(2, "0")}`}
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
            {s.status === "pending" ? (
              <div className="slide-processing" role="status">
                <span className="processing-shimmer">Processing…</span>
              </div>
            ) : (
              <pre>{s.text || s.error || "No text found."}</pre>
            )}
          </article>
        ))}
        {terminal(job.status) && (
          <div className="export-actions">
            <button
              className="secondary"
              onClick={() =>
                copy(
                  [
                    job.caption && !job.slides.some((s) => s.kind === "text")
                      ? `Post text\n${job.caption}`
                      : "",
                    job.slides
                      .map(
                        (s) =>
                          `Slide ${s.position}\n${s.text || s.error || ""}`,
                      )
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
            <SendToI7OS jobId={job.id} version="original" />
          </div>
        )}
        {job.caption && !job.slides.some((s) => s.kind === "text") && (
          <details className="caption">
            <summary>Original post text</summary>
            <button
              className="text-button"
              onClick={() => copy(job.caption || "", "caption")}
            >
              {copied === "caption" ? "Copied" : "Copy post text"}
            </button>
            <pre>{job.caption}</pre>
          </details>
        )}
        </details>
      </div>
    </details>
  );
}
