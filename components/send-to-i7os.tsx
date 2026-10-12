"use client";
import { useEffect, useId, useRef, useState } from "react";
type Workspace = { id: string; name: string; canWrite: boolean };
export default function SendToI7OS({
  jobId,
  version,
  versionId,
  disabled = false,
}: {
  jobId: string;
  version: "original" | "mine";
  disabled?: boolean;
  versionId?: string;
}) {
  const [open, setOpen] = useState(false),
    [workspaces, setWorkspaces] = useState<Workspace[] | null>(null),
    [selected, setSelected] = useState(""),
    [share, setShare] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      url: string;
      workspace: { name: string };
    } | null>(null);
  const lock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  async function request(payload: Record<string, unknown>) {
    const r = await fetch(`/api/jobs/${jobId}/i7os`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Could not connect to i7OS.");
    return data;
  }
  async function choose() {
    if (lock.current) return;
    setOpen(true);
    if (workspaces) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await request({ mode: "workspaces" });
      setWorkspaces(data.workspaces);
      setSelected(data.workspaces.find((w: Workspace) => w.canWrite)?.id || "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function send() {
    if (lock.current || !selected) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setResult(
        await request({
          mode: "document",
          orgId: selected,
          version,
          versionId,
          visibility: share ? "workspace" : "restricted",
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="i7-import">
      <button
        className="text-button"
        disabled={disabled || busy}
        onClick={choose}
      >
        Send to i7OS ↗
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="i7-import-dialog"
          aria-labelledby={dialogId}
          onCancel={(event) => {
            if (lock.current) event.preventDefault();
            else setOpen(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !lock.current)
              setOpen(false);
          }}
        >
          <div className="i7-import-panel">
            <div className="i7-dialog-heading">
              <div>
                <h2 id={dialogId}>
                  {result ? "Saved to i7OS" : "Send to i7OS"}
                </h2>
                <p>
                  {result
                    ? "Your document is ready."
                    : "Turn these slides into a document in your workspace."}
                </p>
              </div>
              <button
                className="i7-dialog-close"
                aria-label="Close import dialog"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            {busy && (
              <p role="status">
                {workspaces ? "Sending to i7OS…" : "Loading workspaces…"}
              </p>
            )}
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            {result ? (
              <div className="i7-import-success">
                <span>Saved to {result.workspace.name}.</span>
                <a
                  className="text-button"
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in i7OS ↗
                </a>
              </div>
            ) : workspaces?.length === 0 ? (
              <p>
                No i7OS account found for your email.{" "}
                <a
                  className="subtle-link"
                  href="https://app.i7os.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get started with i7OS ↗
                </a>
              </p>
            ) : (
              workspaces && (
                <>
                  <label htmlFor={`${dialogId}-workspace`}>Workspace</label>
                  <select
                    id={`${dialogId}-workspace`}
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={busy}
                  >
                    {!selected && <option value="">Choose a workspace</option>}
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id} disabled={!w.canWrite}>
                        {w.name}
                        {w.canWrite ? "" : " — no active i7OS subscription"}
                      </option>
                    ))}
                  </select>
                  <label className="i7-share">
                    <input
                      type="checkbox"
                      checked={share}
                      onChange={(e) => setShare(e.target.checked)}
                      disabled={busy}
                    />
                    Share with the workspace team
                  </label>
                  <small>
                    {share
                      ? "Visible to your workspace team."
                      : "Private — only you can see this document."}
                  </small>
                  <button
                    className="secondary i7-send-button"
                    disabled={busy || !selected}
                    onClick={send}
                  >
                    Send document
                  </button>
                </>
              )
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
