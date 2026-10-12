"use client";
import { useEffect, useRef, useState } from "react";
export default function I7Benefits({
  plan,
  dailyLimit,
  rewriteLimit,
  unlimited,
}: {
  plan: string;
  dailyLimit: number;
  rewriteLimit: number;
  unlimited: boolean;
}) {
  const planLabel =
    (
      { starter: "Starter", pro: "Pro", agency: "Max" } as Record<
        string,
        string
      >
    )[plan] || plan;
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(e: PointerEvent) {
      if (!container.current?.contains(e.target as Node)) setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="account i7-benefits"
      ref={container}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        className="i7-user-chip"
        ref={trigger}
        aria-expanded={open}
        aria-controls="i7-benefits"
        onClick={() => setOpen(!open)}
      >
        i7OS {planLabel}{" "}
        <svg
          className="i7-chip-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="account-dropdown i7-benefits-panel" id="i7-benefits">
          <strong>i7OS {planLabel}</strong>
          <p>Your benefits</p>
          <ul>
            <li>
              {unlimited
                ? "Unlimited extractions"
                : `${dailyLimit} extractions per day`}
            </li>
            <li>
              {unlimited
                ? "Unlimited adaptations"
                : `${rewriteLimit} adaptations per day`}
            </li>
            <li>Send original slides and your versions to i7OS</li>
            <li>Documents stay private unless you share them</li>
          </ul>
          <a
            className="text-button"
            href="https://app.i7os.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open i7OS{" "}
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
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
