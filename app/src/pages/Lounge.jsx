// The Premiere Lounge: where a client waits while the director films. The
// order fires from the composer, this room shows an honest production
// timeline on the left and a cinematic skeleton on the canvas until the cut
// arrives; the moment it does, it plays in the preview and the Publish
// button premieres it. No refresh, no hunting through pages.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { CONFIG } from "../config.js";
import { useAuth } from "../App.jsx";
import { friendly, confetti, PromptDialog, slugProblem } from "../ui.jsx";
import { ledger } from "../orders.js";
import { usePopover } from "../media.js";

const POLL_MS = 7000;

// the production timeline, staged by real status plus elapsed time
const STAGES = [
  { at: 0, kicker: "SCENE 01", line: "Reading the resume for the arc of your story." },
  { at: 45, kicker: "SCENE 02", line: "Casting the look: palette, type, atmosphere." },
  { at: 120, kicker: "SCENE 03", line: "Cameras rolling: generating your film sequences." },
  { at: 300, kicker: "SCENE 04", line: "Cutting scenes together, wiring the scroll." },
  { at: 600, kicker: "SCENE 05", line: "Color grade and final checks. Almost there." },
];

export default function Lounge({ orderId }) {
  const { nav } = useAuth();
  const [status, setStatus] = useState("queued");
  const [failCause, setFailCause] = useState(null);
  const [err, setErr] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const projPop = usePopover();
  const t0 = useRef(Date.now());

  const order = useMemo(() => ledger.list().find((o) => o.orderId === orderId) || null, [orderId]);

  // status truth: poll the pipeline
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.orderStatus(orderId);
        if (!alive) return;
        setStatus(s.status);
        setFailCause(s.failCause || null);
        ledger.setStatus(orderId, s.status);
      } catch { /* transient */ }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    const clock = setInterval(() => setElapsed(Math.floor((Date.now() - t0.current) / 1000)), 1000);
    return () => { alive = false; clearInterval(t); clearInterval(clock); };
  }, [orderId]);

  const ready = status === "ready";
  const failed = ["human_review", "dispatch_failed"].includes(status);
  const stage = [...STAGES].reverse().find((s) => elapsed >= s.at) || STAGES[0];

  const premiere = async (slug) => {
    setBusy(true); setErr("");
    try {
      const site = await api.createSite({ slug, title: order?.name || slug, orderId });
      const r = await api.publish(site.site.siteId, { orderId });
      ledger.acknowledge(orderId);
      confetti();
      nav(`film/${r.siteId || site.site.siteId}`);
    } catch (e) { setErr(friendly(e.message)); setBusy(false); }
  };

  const suggestedSlug = (order?.name || "your-name").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="edshell">
      <div className="edbar">
        <div style={{ position: "relative" }} ref={projPop.ref}>
          <button className="edproj" onClick={projPop.toggle} aria-haspopup="menu" aria-expanded={projPop.open}>
            <span className="lens" aria-hidden="true" />
            <span>Premiere Lounge{order?.name ? ` · ${order.name}` : ""}</span>
            <span className="chev" aria-hidden="true">▾</span>
          </button>
          {projPop.open && (
            <div className="bkmenu" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0 }} role="menu">
              <button role="menuitem" onClick={() => nav("")}><span className="mi" aria-hidden="true">←</span>Go to Dashboard</button>
              <button role="menuitem" onClick={() => nav("films")}><span className="mi" aria-hidden="true">▦</span>All films</button>
              <button role="menuitem" onClick={() => nav("studio")}><span className="mi" aria-hidden="true">◉</span>The Set</button>
            </div>
          )}
        </div>
        <span className="bkchip plain gold">◈ AI DIRECTOR</span>
        <div className="grow" />
        <span className="bkchip plain">{ready ? "DELIVERED" : failed ? "NEEDS A HUMAN" : `FILMING · ${mm}:${ss}`}</span>
        <button className="bkbtn primary" style={{ padding: "6px 16px" }} disabled={!ready || busy} onClick={() => setNaming(true)}>
          {busy ? "Premiering…" : "Publish"}
        </button>
      </div>

      <div className="edsplit">
        <div className="edcfg">
          <div className="edfeed" aria-live="polite">
            <div className="fentry">
              <div className="fwhen"><span className={`dot ${ready ? "green" : failed ? "red" : ""}`} />ORDER {String(orderId).slice(0, 8).toUpperCase()}</div>
              <b>{ready ? "Your film is in." : failed ? "A studio human took over." : "The director is filming your portfolio."}</b>
              <p>
                {ready
                  ? "Watch it on the right. When it feels like you, hit Publish and pick your address; it premieres in seconds."
                  : failed
                    ? `The pipeline hit a snag and paged the studio. Your cut will land here and by email.${failCause ? ` (${failCause})` : ""}`
                    : "A bespoke scroll-story is being filmed from your resume and photos: generated scenes, at least one film sequence, your story told act by act. Typical delivery is under 20 minutes. You can leave; it will be waiting in All films."}
              </p>
            </div>
            {!ready && !failed && (
              <div className="fentry" style={{ borderColor: "rgba(217,164,65,.35)" }}>
                <div className="fwhen"><span className="dot" />{stage.kicker} · NOW</div>
                <b>{stage.line}</b>
              </div>
            )}
            {ready && (
              <div className="fentry" style={{ borderColor: "rgba(23,199,132,.4)" }}>
                <div className="fwhen"><span className="dot green" />THE PREMIERE</div>
                <b>One click left.</b>
                <p>Publish puts this cut on its own address: yourname.cinefolio.dev. Three messages to the director are included if you want changes after.</p>
                <div className="facts">
                  <a className="flink" href={`${CONFIG.apiBase}/studio/cut?orderId=${encodeURIComponent(orderId)}`} target="_blank" rel="noopener noreferrer">Open full screen ↗</a>
                </div>
              </div>
            )}
            {err && <div className="fentry" role="alert" style={{ borderColor: "rgba(230,57,70,.5)" }}><p style={{ color: "var(--bk-red)" }}>{err}</p></div>}
          </div>
        </div>

        <div className="edcanvaswrap">
          <div className="edcanvas" style={!ready ? { background: "var(--bk-bg-2)", borderColor: "var(--bk-line)" } : undefined}>
            {ready ? (
              <iframe title="Your delivered portfolio" src={`${CONFIG.apiBase}/studio/cut/${encodeURIComponent(orderId)}/index.html`} />
            ) : (
              <div className="loungeskel" aria-label="Your portfolio is being filmed">
                <div className="ls-bar"><span className="ls-dot" /><span className="ls-dot" /><span className="ls-dot" /><i className="ls-line w30" /></div>
                <div className="ls-hero">
                  <i className="ls-line w18 ls-kicker" />
                  <i className="ls-title w60" />
                  <i className="ls-title w42" />
                  <i className="ls-line w34" />
                </div>
                <div className="ls-strip"><i /><i /><i /><i /></div>
                <div className="ls-rows"><i className="ls-line w80" /><i className="ls-line w66" /><i className="ls-line w72" /></div>
                <div className="ls-glow" aria-hidden="true" />
              </div>
            )}
          </div>
        </div>
      </div>

      <PromptDialog
        open={naming} kicker="THE PREMIERE" title="Pick your address"
        body="This becomes the film's home. Lowercase letters, numbers and hyphens; you can change cuts later, the address stays."
        placeholder={suggestedSlug} initial={suggestedSlug}
        validate={slugProblem} preview={(v) => `https://${v}.cinefolio.dev`}
        submitLabel="Premiere it" busy={busy}
        onSubmit={(slug) => { setNaming(false); premiere(slug); }}
        onClose={() => setNaming(false)}
      />
    </div>
  );
}
