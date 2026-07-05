// Dashboard v2 — "My Films" as a studio floor: hero metrics, live poster
// previews (scaled sandboxed iframes of the real releases), film-strip release
// timelines with rollback-to-frame, source export, takedown.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { SplitTitle, Skeleton, friendly } from "../ui.jsx";

export default function Dashboard() {
  const { user, nav } = useAuth();
  const [sites, setSites] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [open, setOpen] = useState(null); // { site, releases }

  const load = () => api.sites().then((r) => setSites(r.sites)).catch((e) => setErr(friendly(e.message)));
  useEffect(() => { load(); }, []);

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
    setErr("");
    try { const r = await api.site(s.siteId); setOpen({ site: r.site, releases: r.releases }); }
    catch (e) { setErr(friendly(e.message)); }
  };

  const download = async (s, n) => {
    setErr("");
    try {
      const html = await api.source(s.siteId, n);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `${s.slug}-release-${n}.html` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { setErr(friendly(e.message)); }
  };

  const live = sites?.filter((s) => s.status === "live").length ?? 0;
  const releases = sites?.reduce((a, s) => a + (s.releases || 0), 0) ?? 0;

  return (
    <>
      <div className="pagehead">
        <SplitTitle text="My" serif="films" />
        <p className="sub">Every portfolio is a versioned release. Publishing flips an atomic pointer; rolling back flips it back in seconds.</p>
      </div>

      <div className="metrics">
        <div className="metric"><b>{sites ? sites.length : "–"}</b><span>Films in the vault</span></div>
        <div className="metric"><b>{sites ? releases : "–"}</b><span>Releases cut</span></div>
        <div className="metric"><b>{sites ? live : "–"}</b><span>Now screening</span></div>
      </div>

      {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}
      {sites === null && <div className="grid two"><Skeleton h={220} /><Skeleton h={220} /></div>}

      {sites?.length === 0 && (
        <div className="panel glass" style={{ textAlign: "center", padding: 52 }}>
          <div className="mono" style={{ marginBottom: 10 }}>NOTHING IN PRODUCTION — THE FLOOR IS QUIET</div>
          <h2 style={{ marginBottom: 18 }}>Your first film awaits, {user.email.split("@")[0]}.</h2>
          <button className="btn primary" onClick={() => nav("studio")}>Roll camera on film one</button>
        </div>
      )}

      <div className="grid two">
        {sites?.map((s) => (
          <div key={s.siteId} className="panel sitecard">
            {s.status === "live" && (
              <div className="poster">
                <iframe title={`poster-${s.slug}`} src={s.previewUrl} sandbox="allow-scripts" loading="lazy" scrolling="no" tabIndex={-1} />
                <div className="veil" />
              </div>
            )}
            <div className="row1">
              <h3>{s.title}</h3>
              <span className={`badge ${s.status}`}>{s.status.replace("_", " ")}</span>
            </div>
            <div className="mono" style={{ textTransform: "none", letterSpacing: ".06em" }}>
              {s.slug} · release {s.liveRelease ?? "—"}/{s.releases}{s.pointerMode ? ` · ${s.pointerMode}` : ""}
            </div>
            <div className="btnrow" style={{ marginTop: 8 }}>
              {s.status === "live" && (
                <a className="btn ghost" href={s.previewUrl} target="_blank" rel="noopener noreferrer">Watch live</a>
              )}
              <button className="btn ghost" onClick={() => (open?.site?.siteId === s.siteId ? setOpen(null) : details(s))}>
                {open?.site?.siteId === s.siteId ? "Close reel" : "Open reel"}
              </button>
              {s.status !== "taken_down" && (
                <button className="btn danger" disabled={busyId === s.siteId}
                  onClick={() => { if (window.confirm(`Take ${s.slug} off the marquee? Releases stay in the vault.`)) act(s.siteId, () => api.takedown(s.siteId)); }}>
                  Take down
                </button>
              )}
            </div>

            {open?.site?.siteId === s.siteId && (
              <div className="filmstrip">
                {open.releases.map((r) => (
                  <div key={r.n} className={`frame ${open.site.liveRelease === r.n ? "live" : ""}`}>
                    <div className="n">#{r.n}{open.site.liveRelease === r.n && <span className="badge live" style={{ marginLeft: 6, fontSize: 8 }}>LIVE</span>}</div>
                    <div className="d">{(r.createdAt || "").slice(5, 16).replace("T", " ")}</div>
                    <div className="acts">
                      {open.site.liveRelease !== r.n && open.site.status === "live" && (
                        <button disabled={busyId === s.siteId} onClick={() => act(s.siteId, () => api.rollback(s.siteId, r.n))}>Screen</button>
                      )}
                      <button onClick={() => download(s, r.n)}>Export</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
