// All films: the vault as a gallery. Search, filters, view toggle, poster
// cards, and a kebab per film carrying every real action the old dashboard
// had: share, duplicate, take down, relight, delete. The Director's Cut
// delivery moment premieres from here too.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { CONFIG } from "../config.js";
import { useAuth } from "../App.jsx";
import { friendly, confetti, Dialog, ConfirmDialog, PromptDialog, slugProblem } from "../ui.jsx";
import { ledger } from "../orders.js";

const ageOf = (s) => (s.publishedAt ? Math.floor((Date.now() - new Date(s.publishedAt).getTime()) / 86400000) : 0);

export default function Films() {
  const { nav } = useAuth();
  const [sites, setSites] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("any");
  const [sort, setSort] = useState("edited");
  const [view, setView] = useState("grid");
  const [busyId, setBusyId] = useState(null);
  const [kebab, setKebab] = useState(null);      // siteId | null
  const [sharing, setSharing] = useState(null);
  const [confirmDown, setConfirmDown] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [duping, setDuping] = useState(null);
  const [delivery, setDelivery] = useState(() => ledger.unseenDelivery());
  const [premiereCut, setPremiereCut] = useState(null);
  const [cutSlug, setCutSlug] = useState("");
  const [copied, setCopied] = useState("");
  const cheered = useRef(false);
  const kebabRef = useRef(null);

  const load = () => api.sites().then((r) => setSites(r.sites)).catch((e) => setErr(friendly(e.message)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (delivery && !cheered.current) { cheered.current = true; setTimeout(() => confetti(), 250); }
  }, [delivery]);

  useEffect(() => {
    const h = (e) => { if (kebabRef.current && !kebabRef.current.contains(e.target)) setKebab(null); };
    const k = (e) => { if (e.key === "Escape") setKebab(null); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);

  const act = async (id, fn) => {
    setBusyId(id); setErr(""); setKebab(null);
    try { await fn(); await load(); } catch (e) { setErr(friendly(e.message)); } finally { setBusyId(null); }
  };

  const premiereCutTo = async (siteId) => {
    const o = premiereCut; setBusyId(siteId); setErr("");
    try {
      await api.publish(siteId, { orderId: o.orderId });
      ledger.acknowledge(o.orderId); setPremiereCut(null); setDelivery(null);
      confetti(); await load();
    } catch (e) { setErr(friendly(e.message)); } finally { setBusyId(null); }
  };
  const premiereCutNew = async () => {
    const o = premiereCut;
    const s = (cutSlug || (o.name || "film")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    setBusyId("new"); setErr("");
    try {
      const site = await api.createSite({ slug: s, title: o.name || s, orderId: o.orderId });
      await api.publish(site.site.siteId, { orderId: o.orderId });
      ledger.acknowledge(o.orderId); setPremiereCut(null); setDelivery(null); setCutSlug("");
      confetti(); await load();
    } catch (e) { setErr(friendly(e.message)); } finally { setBusyId(null); }
  };

  const copy = (what, text) => { navigator.clipboard?.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 1600); };
  const blurb = (s) => `My portfolio just premiered: ${s.title}. Watch it at https://${s.slug}.cinefolio.site`;

  const shown = useMemo(() => {
    let list = [...(sites || [])];
    if (q.trim()) { const needle = q.trim().toLowerCase(); list = list.filter((s) => (s.title || "").toLowerCase().includes(needle) || (s.slug || "").toLowerCase().includes(needle)); }
    if (status !== "any") list = list.filter((s) => s.status === status);
    if (sort === "edited") list.sort((a, b) => String(b.updatedAt || b.publishedAt || "").localeCompare(String(a.updatedAt || a.publishedAt || "")));
    if (sort === "name") list.sort((a, b) => String(a.title || a.slug).localeCompare(String(b.title || b.slug)));
    if (sort === "releases") list.sort((a, b) => (b.releases || 0) - (a.releases || 0));
    return list;
  }, [sites, q, status, sort]);

  const stale = shown.filter((s) => s.status === "live" && ageOf(s) >= 60);
  const fresh = shown.filter((s) => !(s.status === "live" && ageOf(s) >= 60));

  const edited = (s) => {
    const d = s.updatedAt || s.publishedAt;
    return d ? `Edited ${new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "Never published";
  };

  const Card = ({ s }) => (
    <div className="bkfilm" style={{ position: "relative" }}>
      <button className="bkfilmbtn" onClick={() => nav(`film/${s.siteId}`)} aria-label={`Open ${s.title || s.slug}`}>
        <span className="bkthumb" aria-hidden="true">
          {s.status === "live" && s.previewUrl
            ? <iframe title={`poster-${s.slug}`} src={s.previewUrl} sandbox="allow-scripts" loading="lazy" scrolling="no" tabIndex={-1} referrerPolicy="no-referrer" />
            : <span className="ghost">{(s.title || s.slug || "FILM").toUpperCase()}</span>}
          {s.status === "live" && <span className="pubbadge">Published</span>}
          {s.stagedRelease && <span className="pubbadge staged" style={s.status === "live" ? { left: "auto", right: 10 } : undefined}>Staged #{s.stagedRelease}</span>}
          {s.status === "taken_down" && <span className="pubbadge down">Taken down</span>}
        </span>
      </button>
      <span className="bkfilmmeta">
        <span className="fava" aria-hidden="true" />
        <span style={{ minWidth: 0 }}>
          <b>{s.title || s.slug}</b>
          <i>{edited(s)} · release {s.liveRelease ?? "·"}/{s.releases ?? 0}</i>
        </span>
        <button className="kebab" aria-label={`Actions for ${s.title || s.slug}`} aria-haspopup="menu" aria-expanded={kebab === s.siteId} onClick={() => setKebab(kebab === s.siteId ? null : s.siteId)}>⋯</button>
      </span>
      {kebab === s.siteId && (
        <div className="bkmenu" ref={kebabRef} style={{ position: "absolute", right: 0, top: "100%", marginTop: 4 }} role="menu">
          <button role="menuitem" onClick={() => { setKebab(null); nav(`film/${s.siteId}`); }}><span className="mi" aria-hidden="true">◉</span>Open in the workspace</button>
          {s.status === "live" && <a role="menuitem" href={s.previewUrl} target="_blank" rel="noopener noreferrer" onClick={() => setKebab(null)}><span className="mi" aria-hidden="true">↗</span>Watch live</a>}
          {s.status === "live" && <button role="menuitem" onClick={() => { setKebab(null); setSharing(s); }}><span className="mi" aria-hidden="true">◈</span>Share</button>}
          {s.liveRelease && s.status === "live" && <button role="menuitem" onClick={() => { setKebab(null); setDuping(s); }}><span className="mi" aria-hidden="true">▦</span>Duplicate</button>}
          {s.status === "taken_down" && s.liveRelease && <button role="menuitem" onClick={() => act(s.siteId, () => api.rollback(s.siteId, s.liveRelease))}><span className="mi" aria-hidden="true">☀</span>Relight</button>}
          <div className="msep" />
          {s.status !== "taken_down" && <button role="menuitem" onClick={() => { setKebab(null); setConfirmDown(s); }}><span className="mi" aria-hidden="true">◐</span>Take down</button>}
          {s.status === "taken_down" && <button role="menuitem" onClick={() => { setKebab(null); setConfirmDelete(s); }} style={{ color: "var(--bk-red)" }}><span className="mi" aria-hidden="true">✕</span>Delete forever</button>}
        </div>
      )}
    </div>
  );

  return (
    <div className="bkpad">
      <div className="bkpagehead">
        <h1>Films</h1>
        <button className="bkbtn lite" onClick={() => nav("studio")}>Create ▾</button>
      </div>

      {delivery && (
        <div className="fentry" style={{ marginBottom: 20, borderColor: "rgba(217, 164, 65, .4)" }} role="status">
          <div className="fwhen"><span className="dot" />DIRECTOR&apos;S CUT · DELIVERED</div>
          <b>Your Director&apos;s Cut is ready.</b>
          <p>Order {delivery.orderId.slice(0, 8).toUpperCase()} is in. Premiere it onto one of your films as the next release, or as a brand new film.</p>
          <div className="facts">
            <button className="bkbtn primary" onClick={() => setPremiereCut(delivery)}>Premiere this cut</button>
            <a className="flink" href={`${CONFIG.apiBase}/studio/cut?orderId=${encodeURIComponent(delivery.orderId)}`} target="_blank" rel="noopener noreferrer">Watch the cut ↗</a>
            <button className="flink" onClick={() => { ledger.acknowledge(delivery.orderId); setDelivery(null); }}>Later</button>
          </div>
        </div>
      )}

      <div className="bkfilters">
        <div className="bksearch"><span aria-hidden="true" style={{ color: "var(--bk-faint)" }}>◌</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search films…" aria-label="Search films" /></div>
        <select className="bkselect" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="edited">Last edited</option>
          <option value="name">Name</option>
          <option value="releases">Most releases</option>
        </select>
        <select className="bkselect" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="any">Any status</option>
          <option value="live">Live</option>
          <option value="draft">Draft</option>
          <option value="taken_down">Taken down</option>
        </select>
        <div className="bkviewtg" role="group" aria-label="View">
          <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")} aria-label="Grid view">▦</button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")} aria-label="List view">☰</button>
        </div>
      </div>

      {err && <div className="fentry" role="alert" style={{ borderColor: "rgba(230,57,70,.5)", marginBottom: 16 }}><p style={{ color: "var(--bk-red)" }}>{err}</p></div>}
      {sites === null && (
        <div className="bkcards" aria-hidden="true">
          <div className="bkskel" /><div className="bkskel" /><div className="bkskel" />
        </div>
      )}
      {sites?.length === 0 && (
        <div className="bkempty">
          <span className="mono">NOTHING IN PRODUCTION</span>
          Your first film is one brief away.
          <div style={{ marginTop: 16 }}><button className="bkbtn primary" onClick={() => nav("studio")}>Open The Set</button></div>
        </div>
      )}

      {view === "grid" ? (
        <>
          {fresh.length > 0 && <div className="bkcards">{fresh.map((s) => <Card key={s.siteId} s={s} />)}</div>}
          {stale.length > 0 && (
            <>
              <div className="bksection" style={{ marginTop: 30 }}>Live 60+ days on the same cut</div>
              <div className="bkcards">{stale.map((s) => <Card key={s.siteId} s={s} />)}</div>
            </>
          )}
        </>
      ) : (
        <div className="bklist">
          {shown.map((s) => (
            <div key={s.siteId} className="bklistrow" onClick={() => nav(`film/${s.siteId}`)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") nav(`film/${s.siteId}`); }}>
              <span className="bkthumb" aria-hidden="true" style={{ width: 92, flex: "0 0 auto", borderRadius: 8 }}>
                {s.status === "live" && s.previewUrl
                  ? <iframe title={`row-${s.slug}`} src={s.previewUrl} sandbox="allow-scripts" loading="lazy" scrolling="no" tabIndex={-1} referrerPolicy="no-referrer" />
                  : <span className="ghost" style={{ fontSize: 7 }}>{(s.title || s.slug || "F").slice(0, 1).toUpperCase()}</span>}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 14 }}>{s.title || s.slug}</b>
                <i style={{ fontStyle: "normal", fontSize: 12, color: "var(--bk-faint)" }}>{s.slug}.cinefolio.site · {edited(s)} · release {s.liveRelease ?? "·"}/{s.releases ?? 0}</i>
              </span>
              <span className="bkchip plain" style={{ color: s.status === "live" ? "var(--bk-green)" : undefined }}>{(s.status || "").replace("_", " ")}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---------- premiere the director's cut ---------- */}
      <Dialog open={!!premiereCut} title="Premiere your Director's Cut" kicker={premiereCut ? `CUT · ${premiereCut.orderId.slice(0, 8).toUpperCase()}` : ""} onClose={() => setPremiereCut(null)} width={520}>
        {premiereCut && (
          <>
            <div className="dlgtext">Choose where this cut premieres. Onto an existing film it becomes the next release; rolling back is one click.</div>
            {(sites || []).map((s) => (
              <div key={s.siteId} className="orderrow">
                <div><b className="ordid">{s.slug}.cinefolio.site</b><span className="mono ordmeta">{s.status === "live" ? `live · release ${s.liveRelease}/${s.releases}` : s.status.replace("_", " ")}</span></div>
                <button type="button" className="btn ghost ordbtn" disabled={busyId === s.siteId} onClick={() => premiereCutTo(s.siteId)}>{busyId === s.siteId ? <span className="spin" /> : null}Premiere here</button>
              </div>
            ))}
            <label className="mono" htmlFor="cutSlug">{sites?.length ? "Or as a new film" : "Premiere name"}</label>
            <input id="cutSlug" value={cutSlug} onChange={(e) => setCutSlug(e.target.value)} placeholder={(premiereCut.name || "your-name").toLowerCase().replace(/[^a-z0-9]+/g, "-")} />
            <div className="btnrow" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" disabled={busyId === "new"} onClick={premiereCutNew}>{busyId === "new" ? <span className="spin" /> : null}Premiere as a new film</button>
            </div>
          </>
        )}
      </Dialog>

      {/* ---------- share kit ---------- */}
      <Dialog open={!!sharing} title="Share your film" kicker="THE MARQUEE" onClose={() => { setSharing(null); setCopied(""); }} width={520}>
        {sharing && (
          <>
            <div className="sharerow">
              <span className="mono sharelbl">LINK</span>
              <span className="shareval mono">{`https://${sharing.slug}.cinefolio.site`}</span>
              <button type="button" className="btn ghost ordbtn" onClick={() => copy("link", `https://${sharing.slug}.cinefolio.site`)}>{copied === "link" ? "Copied ✓" : "Copy"}</button>
            </div>
            <div className="sharerow">
              <span className="mono sharelbl">FOR LINKEDIN</span>
              <span className="shareval">{blurb(sharing)}</span>
              <button type="button" className="btn ghost ordbtn" onClick={() => copy("post", blurb(sharing))}>{copied === "post" ? "Copied ✓" : "Copy"}</button>
            </div>
            <div className="sharerow shareqr">
              <span className="mono sharelbl">QR</span>
              <img width="132" height="132" alt={`QR code for ${sharing.slug}.cinefolio.site`} src={`https://api.qrserver.com/v1/create-qr-code/?size=264x264&data=${encodeURIComponent(`https://${sharing.slug}.cinefolio.site`)}`} onError={(e) => { e.target.closest(".sharerow").style.display = "none"; }} />
              <span className="dlgtext">Drop it on a slide or a business card; it opens your premiere.</span>
            </div>
          </>
        )}
      </Dialog>

      <PromptDialog
        open={!!duping} kicker="NEW CUT" title="Duplicate this film"
        body="A full copy of the current release, ready to take a different direction. Pick its premiere name."
        placeholder={duping ? `${duping.slug}-cut` : ""} initial={duping ? `${duping.slug}-cut` : ""}
        validate={slugProblem} preview={(v) => `https://${v}.cinefolio.site`}
        submitLabel="Create the cut" busy={busyId === duping?.siteId}
        onSubmit={(slug) => { const s = duping; setDuping(null); act(s.siteId, () => api.duplicate(s.siteId, { slug, title: `${s.title} Cut` })); }}
        onClose={() => setDuping(null)}
      />

      <ConfirmDialog
        open={!!confirmDown} danger kicker="OFF THE MARQUEE" title={confirmDown ? `Take down ${confirmDown.slug}?` : ""}
        body="The site goes dark, but every release stays safe in the vault. Relight it any time."
        confirmLabel="Take it down" busy={busyId === confirmDown?.siteId}
        onConfirm={() => { const s = confirmDown; setConfirmDown(null); act(s.siteId, () => api.takedown(s.siteId)); }}
        onClose={() => setConfirmDown(null)}
      />

      <ConfirmDialog
        open={!!confirmDelete} danger kicker="NO WAY BACK" title={confirmDelete ? `Delete ${confirmDelete.slug} forever?` : ""}
        body="Every release and its history burns with it. Export the source from the workspace first if you want a copy."
        confirmLabel="Delete forever" busy={busyId === confirmDelete?.siteId}
        onConfirm={() => { const s = confirmDelete; setConfirmDelete(null); act(s.siteId, () => api.deleteSite(s.siteId)); }}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
