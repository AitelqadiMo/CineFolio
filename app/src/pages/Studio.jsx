// Studio v2 — a production tracker, not a form. The timeline is driven by the
// REAL pipeline status (queued -> filming -> ready), the premiere gets applause,
// and demo orders started on the landing page are adopted here after signup.
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { SplitTitle, confetti, friendly } from "../ui.jsx";

const POLL_MS = 8000, POLL_MAX = 220; // pipeline timeout is 30 min x retries; poll generously

const AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#132550"/><circle cx="50" cy="38" r="16" fill="#C8102E"/><rect x="26" y="60" width="48" height="30" rx="14" fill="#D9A441"/></svg>');

export default function Studio() {
  const { nav } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", role: "engineer", cvText: "" });
  const [order, setOrder] = useState(null);   // { orderId, production, html? }
  const [status, setStatus] = useState(null); // queued | filming | ready | dispatch_failed | human_review | timeout | preview_only
  const [cutHtml, setCutHtml] = useState(null);
  const [pub, setPub] = useState({ slug: "", busy: false, done: null });
  const [pending, setPending] = useState(null); // demo order adopted from the landing page
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const polls = useRef(0);
  const premiereRef = useRef(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // demo -> signup order adoption (landing stores cf.pendingOrder before login)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cf.pendingOrder");
      if (raw) setPending(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const adopt = async () => {
    setErr("");
    try {
      const s = await api.orderStatus(pending.orderId);
      setOrder({ orderId: pending.orderId, production: s.production, html: null });
      setStatus(s.status === "ready" ? "ready" : s.status);
      if (s.status === "ready") setCutHtml(await api.orderCut(pending.orderId));
      setPub({ slug: (pending.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""), busy: false, done: null });
      setForm({ ...form, name: pending.name || "", email: pending.email || "" });
      localStorage.removeItem("cf.pendingOrder");
      setPending(null);
    } catch (e) { setErr(friendly(e.message)); }
  };

  const generate = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await api.generate(form);
      setOrder(r);
      setStatus(r.production ? "queued" : "preview_only");
      setPub({ slug: (form.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""), busy: false, done: null });
    } catch (e2) { setErr(friendly(e2.message)); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!order?.production || !["queued", "filming"].includes(status)) return;
    polls.current = 0;
    const t = setInterval(async () => {
      polls.current += 1;
      try {
        const s = await api.orderStatus(order.orderId);
        if (s.status === "ready") {
          clearInterval(t);
          setStatus("ready");
          setCutHtml(await api.orderCut(order.orderId));
        } else if (["dispatch_failed", "human_review"].includes(s.status)) {
          clearInterval(t);
          setStatus(s.status);
        } else if (s.status === "filming" && status !== "filming") {
          setStatus("filming"); // the tracker advances live
        } else if (polls.current >= POLL_MAX) {
          clearInterval(t);
          setStatus("timeout");
        }
      } catch { /* transient */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [order, status]);

  const publish = async () => {
    setErr(""); setPub({ ...pub, busy: true });
    try {
      const site = await api.createSite({ slug: pub.slug, title: form.name || pub.slug, orderId: order.orderId });
      const body = status === "ready" && cutHtml
        ? { orderId: order.orderId }
        : { html: (cutHtml || order.html).split("__PHOTO__").join(AVATAR) };
      const r = await api.publish(site.site.siteId, body);
      setPub({ ...pub, busy: false, done: { ...r, slug: site.site.slug } });
      setTimeout(() => confetti(premiereRef.current || undefined), 60);
    } catch (e2) { setErr(friendly(e2.message)); setPub({ ...pub, busy: false }); }
  };

  // production tracker state mapping
  const steps = [
    { k: "brief", l: "01 · Brief" },
    { k: "queued", l: "02 · Queued" },
    { k: "filming", l: "03 · Filming" },
    { k: "ready", l: "04 · Director's cut" },
    { k: "premiere", l: "05 · Premiere" },
  ];
  const idx = !order ? 0 : pub.done ? 5 : status === "ready" ? 3 : status === "filming" ? 2 : 1;
  const failed = ["dispatch_failed", "human_review", "timeout"].includes(status);
  const stepClass = (i) => `tstep ${i < idx ? "done" : ""} ${i === idx && !pub.done ? (failed && i >= 1 ? "fail" : "on") : ""} ${pub.done && i <= 4 ? "done" : ""}`;
  const showFrame = cutHtml || order?.html;

  return (
    <>
      <div className="pagehead">
        <SplitTitle text="New" serif="film" />
        <p className="sub">Paste the CV, roll camera. The studio pipeline films the director's cut; you premiere it to the world in one click.</p>
      </div>

      {pending && !order && (
        <div className="panel glass" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div className="mono" style={{ color: "var(--gold)" }}>UNFINISHED BUSINESS FROM THE LOBBY</div>
            <div style={{ marginTop: 6 }}>Your demo cut for <b>{pending.name || pending.email}</b> is waiting to premiere.</div>
          </div>
          <div className="btnrow" style={{ marginTop: 0 }}>
            <button className="btn primary" onClick={adopt}>Continue that order</button>
            <button className="btn ghost" onClick={() => { localStorage.removeItem("cf.pendingOrder"); setPending(null); }}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="tracker">
        {steps.map((s, i) => (
          <div key={s.k} className={stepClass(i)}>
            <div className="bar" /><div className="dot2" />
            <div className="lbl2">{s.l}</div>
          </div>
        ))}
      </div>

      {!order && (
        <form className="panel" onSubmit={generate}>
          <div className="grid two">
            <div>
              <label className="mono">Full name</label>
              <input required value={form.name} onChange={set("name")} placeholder="Nadia Benali" />
            </div>
            <div>
              <label className="mono">Email</label>
              <input required type="email" value={form.email} onChange={set("email")} placeholder="nadia@example.com" />
            </div>
          </div>
          <label className="mono">Role</label>
          <select value={form.role} onChange={set("role")}>
            <option value="engineer">Engineer</option>
            <option value="designer">Designer</option>
            <option value="founder">Founder</option>
            <option value="other">Other</option>
          </select>
          <label className="mono">CV / career text</label>
          <textarea required value={form.cvText} onChange={set("cvText")} placeholder="Paste the CV text. Years + skills are picked up automatically." />
          {err && <div className="err">{err}</div>}
          <div className="btnrow"><button className="btn primary" disabled={busy}>{busy ? <span className="spin" /> : null}Roll camera</button></div>
        </form>
      )}

      {order && (
        <div className="panel" ref={premiereRef} style={{ position: "relative", overflow: "hidden" }}>
          {status === "queued" && <div className="mono" style={{ marginBottom: 14 }}><span className="pulse" />IN THE QUEUE — THE PIPELINE PICKS IT UP IN SECONDS</div>}
          {status === "filming" && <div className="mono" style={{ marginBottom: 14, color: "var(--gold)" }}><span className="pulse" />CAMERAS ROLLING — THE DIRECTOR'S CUT IS IN PRODUCTION</div>}
          {status === "ready" && !pub.done && <div className="okmsg" style={{ marginTop: 0, marginBottom: 14 }}>The director's cut is in. Review it below, then premiere it.</div>}
          {status === "preview_only" && <div className="mono" style={{ marginBottom: 14 }}>ROUGH CUT (pipeline not armed in this environment)</div>}
          {failed && !pub.done && (
            <div className="err" style={{ marginTop: 0, marginBottom: 14 }}>
              The studio is at capacity right now — your director's cut will arrive by email. The rough cut below premieres beautifully in the meantime.
            </div>
          )}

          {showFrame ? (
            <iframe className="cutframe" title="cut" sandbox="allow-scripts" srcDoc={(cutHtml || order.html || "").split("__PHOTO__").join(AVATAR)} />
          ) : (
            <div className="cutframe" style={{ display: "grid", placeItems: "center" }}>
              <div className="mono">{status === "ready" ? "LOADING THE CUT…" : "THE SCREEN LIGHTS UP WHEN THE CUT ARRIVES"}</div>
            </div>
          )}

          <div className="grid two" style={{ marginTop: 18 }}>
            <div>
              <label className="mono">Premiere slug</label>
              <input value={pub.slug} onChange={(e) => setPub({ ...pub, slug: e.target.value })} placeholder="nadia-benali" />
              <div className="mono" style={{ marginTop: 6, letterSpacing: ".08em", textTransform: "none" }}>
                your URL on the platform CDN — {pub.slug || "slug"}.cinefolio.site when custom domains open
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <div className="btnrow" style={{ marginTop: 0 }}>
                <button className="btn primary" disabled={pub.busy || !showFrame || !!pub.done} onClick={publish}>
                  {pub.busy ? <span className="spin" /> : null}{pub.done ? "Premiered" : status === "ready" ? "Premiere director's cut" : "Premiere rough cut"}
                </button>
                <button className="btn ghost" onClick={() => { setOrder(null); setStatus(null); setCutHtml(null); setPub({ slug: "", busy: false, done: null }); }}>New brief</button>
              </div>
            </div>
          </div>

          {err && <div className="err">{err}</div>}
          {pub.done && (
            <div className="premiere">
              <div className="mq">Now screening — <em>release #{pub.done.release}</em></div>
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <a className="btn gold" style={{ background: "var(--gold)", borderColor: "var(--gold)", color: "var(--navy)" }} href={pub.done.url} target="_blank" rel="noopener noreferrer">Watch it live</a>
                <button className="btn ghost" onClick={() => { navigator.clipboard?.writeText(pub.done.url); }}>Copy premiere link</button>
                <a className="btn ghost" onClick={() => nav("dashboard")} style={{ cursor: "pointer" }}>Manage in My Films</a>
              </div>
            </div>
          )}
          <div className="mono" style={{ marginTop: 14 }}>ORDER {order.orderId}</div>
        </div>
      )}
    </>
  );
}
