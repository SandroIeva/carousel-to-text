"use client";
import { useEffect, useRef } from "react";
export default function UpgradePreview({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="i7-import-dialog upgrade-dialog"
      aria-labelledby="upgrade-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="i7-import-panel upgrade-panel">
        <button
          className="i7-dialog-close"
          aria-label="Close preview"
          onClick={onClose}
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
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span className="upgrade-eyebrow">SLIDE SCRAPE + i7OS</span>
        <h2 id="upgrade-title">Keep creating with i7OS.</h2>
        <p>
          You’ve used your 5 free scrapes. Create an i7OS account and choose a
          plan to unlock more content.
        </p>
        <ul>
          <li>More scrapes and adaptations</li>
          <li>Turn slides into your own content</li>
          <li>Send documents straight to your workspace</li>
        </ul>
        <a className="upgrade-cta" href="https://i7os.com/pricing.html">
          Explore i7OS plans{" "}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 12h14m-6-6 6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
        <small className="upgrade-preview-note">
          Admin preview · Your account stays unlimited.
        </small>
      </div>
    </dialog>
  );
}
