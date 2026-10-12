"use client";
import { useRef, useState } from "react";
type Workspace = { id: string; name: string; canWrite: boolean };
export default function SendToI7OS({
  jobId,
  version,
  disabled = false,
}: {
  jobId: string;
  version: "original" | "mine";
  disabled?: boolean;
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
        <div className="i7-import-panel">
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
                <label htmlFor={`workspace-${jobId}-${version}`}>
                  Workspace
                </label>
                <select
                  id={`workspace-${jobId}-${version}`}
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
                  className="secondary"
                  disabled={busy || !selected}
                  onClick={send}
                >
                  Send document
                </button>
              </>
            )
          )}
          {!busy && (
            <button className="text-button" onClick={() => setOpen(false)}>
              Close
            </button>
          )}
        </div>
      )}
    </div>
  );
}
