// ui.jsx: shared studio-floor primitives. Split-char titles, confetti, skeletons,
// friendly error language, and the branded dialog system that replaces every
// native prompt and confirm in the console.
import { useEffect, useRef, useState } from "react";

export function SplitTitle({ text, serif }) {
  let i = 0;
  const chars = (s, cls) =>
    s.split("").map((ch, k) =>
      ch === " " ? " " : (
        <span key={cls + k} className="chx" style={{ animationDelay: `${(i++) * 22}ms` }}>{ch}</span>
      )
    );
  return (
    <h1>
      {chars(text, "t")}
      {serif && <> <em>{chars(serif, "s")}</em></>}
    </h1>
  );
}

// premiere applause: DOM confetti in the jersey palette, ~1.9s, self-cleaning
export function confetti(host) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#C8102E", "#E63946", "#D9A441", "#0E9E62", "#F4EFE6"];
  const n = 42;
  for (let i = 0; i < n; i++) {
    const c = document.createElement("i");
    c.className = "confetti";
    c.style.left = `${4 + Math.random() * 92}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = `${Math.random() * 350}ms`;
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    (host || document.body).appendChild(c);
    setTimeout(() => c.remove(), 2600);
  }
}

export const Skeleton = ({ h = 92, style }) => <div className="skel" style={{ height: h, ...style }} />;

// human error language: never a raw error string without a next step
export function friendly(message) {
  const m = String(message || "");
  if (/order cut not ready/i.test(m)) return "The director's cut isn't in yet. Premiere the rough cut now, or wait for the studio email.";
  if (/slug taken/i.test(m)) return "That premiere name is taken. Pick another slug, it becomes your URL.";
  if (/Session expired/i.test(m)) return "Your session expired. Sign in again and you're right back here.";
  if (/network|fetch/i.test(m)) return "Network hiccup. Give it a second and try again.";
  if (/internal_error/i.test(m)) return "The studio hit a snag on our side. Try again; if it repeats, we're already alarmed about it.";
  if (/status .* not retryable/i.test(m)) return "This order already premiered. Nothing to retry.";
  if (/Request failed/i.test(m)) return "The studio hit a snag. Try again in a moment, or reach the studio from Account, Support.";
  return m || "Something unexpected happened. Try again, or reach the studio from Account, Support.";
}

/* ---------- dialog system ----------
   One branded modal primitive: focus is trapped, Escape closes, focus returns
   to the opener. Replaces window.prompt and window.confirm everywhere. */
export function Dialog({ open, title, kicker, children, onClose, width = 480 }) {
  const boxRef = useRef(null);
  const returnRef = useRef(null);
  // onClose via ref so the effect never lists it as a dependency: callers pass
  // an inline onClose (new identity each render), and a parent that re-renders
  // on a timer (e.g. the Lounge clock) would otherwise re-run this effect every
  // tick — thrashing focus out of the input mid-keystroke. Deps are [open] only.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    returnRef.current = document.activeElement;
    const box = boxRef.current;
    const focusTimer = setTimeout(() => {
      const first = box?.querySelector("input, textarea, select, button");
      first?.focus();
    }, 30);
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); }
      if (e.key === "Tab" && box) {
        const items = [...box.querySelectorAll("input, textarea, select, button, a[href]")].filter((el) => !el.disabled);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey, true);
      if (returnRef.current?.focus) returnRef.current.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="dlg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlgbox glass" role="dialog" aria-modal="true" aria-label={title} ref={boxRef} style={{ maxWidth: width }}>
        <div className="dlghead">
          {kicker && <span className="mono dlgkick">{kicker}</span>}
          <h3>{title}</h3>
          <button type="button" className="dlgx" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="dlgbody">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, kicker, body, confirmLabel = "Confirm", danger, busy, onConfirm, onClose }) {
  return (
    <Dialog open={open} title={title} kicker={kicker} onClose={onClose}>
      <div className="dlgtext">{body}</div>
      <div className="btnrow" style={{ marginTop: 18 }}>
        <button type="button" className={`btn ${danger ? "danger" : "primary"}`} disabled={busy} onClick={onConfirm}>
          {busy ? <span className="spin" /> : null}{confirmLabel}
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

export function PromptDialog({ open, title, kicker, body, placeholder, initial = "", validate, preview, submitLabel = "Continue", busy, onSubmit, onClose }) {
  const [val, setVal] = useState(initial);
  useEffect(() => { if (open) setVal(initial); }, [open, initial]);
  const problem = validate ? validate(val) : "";
  return (
    <Dialog open={open} title={title} kicker={kicker} onClose={onClose}>
      {body && <div className="dlgtext">{body}</div>}
      <form onSubmit={(e) => { e.preventDefault(); if (!problem && val.trim()) onSubmit(val.trim()); }}>
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} style={{ marginTop: 12 }} />
        {preview && val.trim() && !problem && <div className="mono dlgpreview">{preview(val.trim())}</div>}
        {problem && val.trim() && <div className="err" style={{ marginTop: 10 }}>{problem}</div>}
        <div className="btnrow" style={{ marginTop: 16 }}>
          <button type="submit" className="btn primary" disabled={busy || !val.trim() || !!problem}>
            {busy ? <span className="spin" /> : null}{submitLabel}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}

export const slugProblem = (v) =>
  /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) ? "" : "Lowercase letters, numbers, and single hyphens only. It becomes your URL.";
