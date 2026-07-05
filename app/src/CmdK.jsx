// CmdK — the keyboard-first hallmark of serious platform software.
// ⌘K / Ctrl+K anywhere in the console: navigate, act, jump to live films.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { signOut } from "./cognito.js";

export default function CmdK({ nav, admin }) {
  const [open, setOpen] = useState(false);
  const [qy, setQy] = useState("");
  const [sel, setSel] = useState(0);
  const [sites, setSites] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o); setQy(""); setSel(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 30);
    api.sites().then((r) => setSites(r.sites.filter((s) => s.status === "live"))).catch(() => {});
  }, [open]);

  const items = useMemo(() => {
    const base = [
      { k: "nav", label: "My Films", hint: "G then F", run: () => nav("dashboard") },
      { k: "nav", label: "New Film — roll camera", hint: "G then N", run: () => nav("studio") },
      { k: "nav", label: "Account settings", run: () => nav("account") },
      ...(admin ? [{ k: "nav", label: "Production floor (admin)", run: () => nav("admin") }] : []),
      ...sites.map((s) => ({ k: "site", label: `Watch live — ${s.title}`, hint: s.slug, run: () => window.open(s.previewUrl, "_blank", "noopener") })),
      { k: "act", label: "Reference screening — aitelqadi.dev", run: () => window.open("https://www.aitelqadi.dev", "_blank", "noopener") },
      { k: "act", label: "Sign out", run: () => { signOut(); nav(""); } },
    ];
    const f = qy.trim().toLowerCase();
    return f ? base.filter((i) => i.label.toLowerCase().includes(f) || (i.hint || "").toLowerCase().includes(f)) : base;
  }, [qy, sites, admin, nav]);

  useEffect(() => { setSel(0); }, [qy]);

  if (!open) return null;
  const go = (i) => { setOpen(false); items[i]?.run(); };

  return (
    <div className="cmdk" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="cmdkbox glass" role="dialog" aria-label="Command palette">
        <div className="cmdkbar">
          <span className="mono" style={{ color: "var(--gold)" }}>◈</span>
          <input
            ref={inputRef} value={qy} placeholder="Type a command or search…"
            onChange={(e) => setQy(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter") go(sel);
            }}
          />
          <span className="mono" style={{ fontSize: 8.5 }}>ESC</span>
        </div>
        <div className="cmdklist">
          {items.length === 0 && <div className="mono" style={{ padding: 16 }}>NOTHING ON THE CALL SHEET FOR "{qy.toUpperCase()}"</div>}
          {items.map((i, k) => (
            <button key={i.label} className={`cmdkitem ${k === sel ? "on" : ""}`} onMouseEnter={() => setSel(k)} onClick={() => go(k)}>
              <span>{i.label}</span>
              {i.hint && <span className="mono" style={{ fontSize: 8.5 }}>{i.hint}</span>}
            </button>
          ))}
        </div>
        <div className="cmdkfoot mono">↑↓ NAVIGATE · ⏎ ACTION · THE WHOLE STUDIO, TWO KEYSTROKES AWAY</div>
      </div>
    </div>
  );
}
