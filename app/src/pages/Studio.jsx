// Studio — the product loop: brief -> instant rough cut -> director's cut (agent
// pipeline) -> publish as an immutable release on the hosting platform.
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";

const POLL_MS = 8000, POLL_MAX = 45; // ~6 minutes

export default function Studio() {
  const { nav } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", role: "engineer", cvText: "" });
  const [order, setOrder] = useState(null);   // { orderId, production, html }
  const [status, setStatus] = useState(null); // queued | ready | dispatch_failed
  const [cutHtml, setCutHtml] = useState(null);
  const [pub, setPub] = useState({ slug: "", busy: false, done: null });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const polls = useRef(0);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const generate = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await api.generate(form);
      setOrder(r);
      setStatus(r.production ? "queued" : "preview_only");
      setPub({ ...pub, slug: (form.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!order?.production || status !== "queued") return;
    polls.current = 0;
    const t = setInterval(async () => {
      polls.current += 1;
      try {
        const s = await api.orderStatus(order.orderId);
        if (s.status === "ready") {
          clearInterval(t);
          setStatus("ready");
          setCutHtml(await api.orderCut(order.orderId));
        } else if (s.status === "dispatch_failed" || polls.current >= POLL_MAX) {
          clearInterval(t);
          setStatus(s.status === "dispatch_failed" ? "dispatch_failed" : "timeout");
        }
      } catch { /* transient poll errors are fine */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [order, status]);

  const publish = async () => {
    setErr(""); setPub({ ...pub, busy: true });
    try {
      const site = await api.createSite({ slug: pub.slug, title: form.name || pub.slug, orderId: order.orderId });
      const r = await api.publish(site.site.siteId, { orderId: order.orderId });
      setPub({ ...pub, busy: false, done: { ...r, slug: site.site.slug } });
    } catch (e2) { setErr(e2.message); setPub({ ...pub, busy: false }); }
  };

  const stepClass = (s) => `step ${s}`;
  const showFrame = cutHtml || order?.html;

  return (
    <>
      <div className="pagehead">
        <h1>New <em>film</em></h1>
        <p className="sub">Paste the CV, roll camera. You get an instant rough cut; the studio pipeline renders the director's cut and you publish it to the hosting platform in one click.</p>
      </div>

      <div className="steps">
        <span className={stepClass(order ? "done" : "on")}>01 · Brief</span>
        <span className={stepClass(order ? (status === "queued" ? "on" : "done") : "")}>02 · Rough cut</span>
        <span className={stepClass(status === "ready" ? "done" : status === "queued" ? "on" : "")}>03 · Director's cut</span>
        <span className={stepClass(pub.done ? "done" : status === "ready" ? "on" : "")}>04 · Premiere</span>
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
        <div className="panel">
          {status === "queued" && <div className="mono" style={{ marginBottom: 14 }}><span className="pulse" />DIRECTOR'S CUT IN PRODUCTION — ROUGH CUT BELOW</div>}
          {status === "ready" && <div className="okmsg" style={{ marginTop: 0, marginBottom: 14 }}>Director's cut delivered. Review it below, then premiere it.</div>}
          {status === "preview_only" && <div className="mono" style={{ marginBottom: 14 }}>ROUGH CUT (pipeline not armed in this environment)</div>}
          {(status === "dispatch_failed" || status === "timeout") && (
            <div className="err" style={{ marginTop: 0, marginBottom: 14 }}>
              {status === "dispatch_failed" ? "The production pipeline rejected the dispatch (webhook). The rough cut below still works." : "The director's cut is taking longer than expected. Keep this order id and check back."}
            </div>
          )}

          {showFrame && <iframe className="cutframe" title="cut" sandbox="allow-scripts" srcDoc={cutHtml || order.html} />}

          <div className="grid two" style={{ marginTop: 18 }}>
            <div>
              <label className="mono">Premiere slug</label>
              <input value={pub.slug} onChange={(e) => setPub({ ...pub, slug: e.target.value })} placeholder="nadia-benali" />
              <div className="mono" style={{ marginTop: 6, letterSpacing: ".08em", textTransform: "none" }}>
                {pub.slug || "slug"}.cinefolio.site (custom domain phase) — served from the platform CDN today
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <div className="btnrow" style={{ marginTop: 0 }}>
                <button className="btn primary" disabled={pub.busy || !(cutHtml || order.html) || !!pub.done} onClick={publish}>
                  {pub.busy ? <span className="spin" /> : null}{pub.done ? "Premiered" : status === "ready" ? "Premiere director's cut" : "Premiere rough cut"}
                </button>
                <button className="btn ghost" onClick={() => { setOrder(null); setStatus(null); setCutHtml(null); setPub({ slug: "", busy: false, done: null }); }}>New brief</button>
              </div>
            </div>
          </div>

          {err && <div className="err">{err}</div>}
          {pub.done && (
            <div className="okmsg">
              Release #{pub.done.release} is live: <a href={pub.done.url} target="_blank" rel="noopener noreferrer">{pub.done.url}</a> — manage it in <a onClick={() => nav("dashboard")} style={{ cursor: "pointer" }}>My Films</a>.
            </div>
          )}
          <div className="mono" style={{ marginTop: 14 }}>ORDER {order.orderId}</div>
        </div>
      )}
    </>
  );
}
