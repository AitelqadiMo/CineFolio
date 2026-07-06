// Dashboard v3: "My Films" as the client's vault. Hero metrics, live poster
// previews, the Director's Cut delivery moment, a share kit per film, view
// counts when the stats route is wired, and a release history that leads with
// "revert to previous" instead of archaeology. All destructive and naming flows
// run through branded dialogs; no native prompts anywhere.
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { SplitTitle, Skeleton, friendly, confetti, Dialog, ConfirmDialog, PromptDialog, slugProblem } from "../ui.jsx";
import { ledger } from "../orders.js";

const hasDraft = () => { try { return !!localStorage.getItem("cf.studioDraft"); } catch { return false; } };

const HISTORY_PREVIEW = 4;

export default function Dashboard() {
  const { user, nav } = useAuth();
  const [sites, setSites] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [open, setOpen] = useState(null);       // { site, releases }
  const [allFrames, setAllFrames] = useState(false);
  const [views, setViews] = useState({});       // siteId -> count (when stats route is wired)
  const [delivery, setDelivery] = useState(() => ledger.unseenDelivery());
  const [sharing, setSharing] = useState(null); // site | null
  const [confirmDown, setConfirmDown] = useState(null); // site | null
  const [duping, setDuping] = useState(null);   // site | null
  const [copied, setCopied] = useState("");
  const cheered = useRef(false);
  const [firstRun, setFirstRun] = useState({ dossier: false, draft: hasDraft() });

  const load = () => api.sites().then((r) => {
    setSites(r.sites);
    r.sites.filter((s) => s.status === "live").forEach((s) => {
      api.siteStats(s.siteId)
        .then((st) => setViews((v) => ({ ...v, [s.siteId]: st.views ?? st.total ?? null })))
        .catch(() => { /* stats route not wired yet: the chip simply waits */ });
    });
  }).catch((e) => setErr(friendly(e.message)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.getProfile().then((r) => setFirstRun((f) => ({ ...f, dossier: !!r.profile }))).catch(() => {});
  }, []);

  useEffect(() => {
    if (delivery && !cheered.current) { cheered.current = true; setTimeout(() => confetti(), 250); }
  }, [delivery]);

  const act = async (id, fn) => {
    setBusyId(id); setErr("");
    try {
      await fn();
      await load();
      if (open?.site?.siteId === id) {
        const r = await api.site(id);
        setOpen({ site: r.site, releases: r.releases });
      }
    } catch (e) { setErr(friendly(e.message)); } finally { setBusyId(null); }
  };

  const details = async (s) => {
    setErr(""); setAllFrames(false);
    try { const r = await api.site(s.siteId); setOpen({ site: r.site, releases: r.releases }); }
    catch (e) { setErr(friendly(e.message)); }
  };

  const copy = (what, text) => {
    navigator.clipboard?.writeText(text);
    setCopied(what); setTimeout(() => setCopied(""), 1600);
  };

  const live = sites?.filter((s) => s.status === "live").length ?? 0;
  const releases = sites?.reduce((a, s) => a + (s.releases || 0), 0) ?? 0;
  const blurb = (s) => `My portfolio just premiered: ${s.title}. Watch it at https://${s.slug}.cinefolio.site`;
  const frames = open ? (allFrames ? open.releases : open.releases.slice(-HISTORY_PREVIEW)) : [];

  return (
    <>
      <div className="pagehead" data-scene="SCENE 01 · THE VAULT">
        <SplitTitle text="My" serif="films" />
        <p className="sub">Every portfolio is a versioned release. Publishing flips an atomic pointer; rolling back flips it back in seconds.</p>
      </div>

      {delivery && (
        <div className="premiere delivery" role="status">
          <div className="mq">Your Director's Cut <em>is ready.</em></div>
          <p className="dlgtext" style={{ marginTop: 6 }}>
            Order {delivery.orderId.slice(0, 8).toUpperCase()} premiered as a new release on your film below. One revision is included whenever you want it.
          </p>
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => { ledger.acknowledge(delivery.orderId); setDelivery(null); }}>Take a bow</button>
            <button className="btn ghost" onClick={() => nav("account")}>View order</button>
          </div>
        </div>
      )}

      <div className="metrics" style={delivery ? { marginTop: 20 } : undefined}>
        <div className="metric"><b>{sites ? sites.length : "···"}</b><span>Films in the vault</span></div>
        <div className="metric"><b>{sites ? releases : "···"}</b><span>Releases cut</span></div>
        <div className="metric"><b>{sites ? live : "···"}</b><span>Now screening</span></div>
      </div>

      {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}
      {sites === null && <div className="grid two"><Skeleton h={220} /><Skeleton h={220} /></div>}

      {sites?.length === 0 && (
        <div className="panel glass" style={{ padding: 40 }}>
          <div className="mono" style={{ marginBottom: 8 }}>NOTHING IN PRODUCTION · THE FLOOR IS QUIET</div>
          <h2 style={{ marginBottom: 6 }}>Your first film, {user.email.split("@")[0]}.</h2>
          <p className="dlgtext" style={{ marginBottom: 18 }}>Three steps from resume to a live premiere. Take them in any order; the studio keeps up.</p>
          <div className="steps3">
            <button className={`step3 ${firstRun.dossier ? "done" : ""}`} onClick={() => nav("profile")}>
              <span className="stepno" aria-hidden="true">{firstRun.dossier ? "✓" : "1"}</span>
              <span className="steptxt"><b>Fill your dossier</b><i>Upload a resume once; every film casts from it.</i></span>
            </button>
            <button className={`step3 ${firstRun.draft ? "done" : ""}`} onClick={() => nav("studio")}>
              <span className="stepno" aria-hidden="true">{firstRun.draft ? "✓" : "2"}</span>
              <span className="steptxt"><b>Direct your free take</b><i>Pick a look; your site renders as you type.</i></span>
            </button>
            <button className="step3" onClick={() => nav("studio")}>
              <span className="stepno" aria-hidden="true">3</span>
              <span className="steptxt"><b>Premiere it</b><i>One click, live on yourname.cinefolio.site.</i></span>
            </button>
          </div>
        </div>
      )}

      <div className="grid two">
        {sites?.map((s) => (
          <div key={s.siteId} className="panel sitecard">
            {s.status === "live" && (
              <div className="poster">
                <iframe title={`poster-${s.slug}`} src={s.previewUrl} sandbox="allow-scripts" loading="lazy" scrolling="no" tabIndex={-1} aria-hidden="true" />
                <div className="veil" />
              </div>
            )}
            <div className="row1">
              <h2 className="cardtitle">{s.title}</h2>
              <span className={`badge ${s.status}`}>{s.status.replace("_", " ")}</span>
            </div>
            <div className="mono" style={{ textTransform: "none", letterSpacing: ".06em" }}>
              {s.slug} · release {s.liveRelease ?? "·"}/{s.releases}
              {typeof views[s.siteId] === "number" ? ` · seen ${views[s.siteId]} times` : ""}
            </div>
            <div className="btnrow" style={{ marginTop: 8 }}>
              {s.status === "live" && (
                <a className="btn ghost" href={s.previewUrl} target="_blank" rel="noopener noreferrer">Watch live</a>
              )}
              {s.status === "live" && (
                <button className="btn ghost" onClick={() => setSharing(s)}>Share</button>
              )}
              <button className="btn ghost" onClick={() => (open?.site?.siteId === s.siteId ? setOpen(null) : details(s))}>
                {open?.site?.siteId === s.siteId ? "Close reel" : "Open reel"}
              </button>
              {s.liveRelease && s.status === "live" && (
                <button className="btn ghost" disabled={busyId === s.siteId} onClick={() => setDuping(s)}>Duplicate</button>
              )}
              {s.stagedRelease && (
                <a className="btn ghost" href={s.stagedUrl} target="_blank" rel="noopener noreferrer" style={{ borderColor: "rgba(217,164,65,.5)", color: "var(--gold)" }}>
                  Preview staged #{s.stagedRelease}
                </a>
              )}
              {s.status === "taken_down" && s.liveRelease && (
                <button className="btn ghost" disabled={busyId === s.siteId} onClick={() => act(s.siteId, () => api.rollback(s.siteId, s.liveRelease))}>
                  Relight
                </button>
              )}
              {s.status !== "taken_down" && (
                <button className="btn danger" disabled={busyId === s.siteId} onClick={() => setConfirmDown(s)}>Take down</button>
              )}
            </div>

            {open?.site?.siteId === s.siteId && (
              <>
                {open.site.status === "live" && open.releases.length > 1 && open.site.liveRelease > 1 && (
                  <div className="btnrow" style={{ marginTop: 12 }}>
                    <button className="btn ghost" disabled={busyId === s.siteId}
                      onClick={() => act(s.siteId, () => api.rollback(s.siteId, open.site.liveRelease - 1))}>
                      ↩ Revert to previous release
                    </button>
                  </div>
                )}
                <div className="filmstrip">
                  {!allFrames && open.releases.length > HISTORY_PREVIEW && (
                    <button className="frame framemore" onClick={() => setAllFrames(true)}>
                      <span className="n">+{open.releases.length - HISTORY_PREVIEW}</span>
                      <span className="d">SHOW ALL</span>
                    </button>
                  )}
                  {frames.map((r) => (
                    <div key={r.n} className={`frame ${open.site.liveRelease === r.n ? "live" : ""}`}>
                      <div className="n">#{r.n}{open.site.liveRelease === r.n && <span className="badge live mini" style={{ marginLeft: 6 }}>LIVE</span>}{open.site.stagedRelease === r.n && <span className="badge draft mini" style={{ marginLeft: 6 }}>STAGED</span>}</div>
                      <div className="d">{(r.createdAt || "").slice(5, 16).replace("T", " ")}</div>
                      <div className="acts">
                        {open.site.liveRelease !== r.n && (open.site.status === "live" || open.site.stagedRelease === r.n) && (
                          <button disabled={busyId === s.siteId} onClick={() => act(s.siteId, () => api.rollback(s.siteId, r.n))}>
                            {open.site.stagedRelease === r.n ? "Go live" : "Screen"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ---------- share kit ---------- */}
      <Dialog open={!!sharing} title="Share your film" kicker="THE MARQUEE" onClose={() => { setSharing(null); setCopied(""); }} width={520}>
        {sharing && (
          <>
            <div className="sharerow">
              <span className="mono sharelbl">LINK</span>
              <span className="shareval mono">{`https://${sharing.slug}.cinefolio.site`}</span>
              <button type="button" className="btn ghost ordbtn" onClick={() => copy("link", `https://${sharing.slug}.cinefolio.site`)}>
                {copied === "link" ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="sharerow">
              <span className="mono sharelbl">FOR LINKEDIN</span>
              <span className="shareval">{blurb(sharing)}</span>
              <button type="button" className="btn ghost ordbtn" onClick={() => copy("post", blurb(sharing))}>
                {copied === "post" ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="sharerow shareqr">
              <span className="mono sharelbl">QR</span>
              <img
                width="132" height="132" alt={`QR code for ${sharing.slug}.cinefolio.site`}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=264x264&data=${encodeURIComponent(`https://${sharing.slug}.cinefolio.site`)}`}
                onError={(e) => { e.target.closest(".sharerow").style.display = "none"; }}
              />
              <span className="dlgtext">Drop it on a slide or a business card; it opens your premiere.</span>
            </div>
          </>
        )}
      </Dialog>

      {/* ---------- duplicate ---------- */}
      <PromptDialog
        open={!!duping} kicker="NEW CUT" title="Duplicate this film"
        body="A full copy of the current release, ready to take a different direction. Pick its premiere name."
        placeholder={duping ? `${duping.slug}-cut` : ""} initial={duping ? `${duping.slug}-cut` : ""}
        validate={slugProblem} preview={(v) => `https://${v}.cinefolio.site`}
        submitLabel="Create the cut" busy={busyId === duping?.siteId}
        onSubmit={(slug) => { const s = duping; setDuping(null); act(s.siteId, () => api.duplicate(s.siteId, { slug, title: `${s.title} Cut` })); }}
        onClose={() => setDuping(null)}
      />

      {/* ---------- take down ---------- */}
      <ConfirmDialog
        open={!!confirmDown} danger kicker="OFF THE MARQUEE" title={confirmDown ? `Take down ${confirmDown.slug}?` : ""}
        body="The site goes dark, but every release stays safe in the vault. Relight it any time with one click."
        confirmLabel="Take it down" busy={busyId === confirmDown?.siteId}
        onConfirm={() => { const s = confirmDown; setConfirmDown(null); act(s.siteId, () => api.takedown(s.siteId)); }}
        onClose={() => setConfirmDown(null)}
      />
    </>
  );
}
