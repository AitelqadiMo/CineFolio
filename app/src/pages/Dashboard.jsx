// Dashboard — the client's films: live links, release history, rollback, source export.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";

export default function Dashboard() {
  const { user, nav } = useAuth();
  const [sites, setSites] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [open, setOpen] = useState(null); // { site, releases }

  const load = () => api.sites().then((r) => setSites(r.sites)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const act = async (id, fn) => {
    setBusyId(id); setErr("");
    try {
      await fn();
      await load();
      if (open?.site?.siteId === id) await details({ siteId: id });
    } catch (e) { setErr(e.message); } finally { setBusyId(null); }
  };

  const details = async (s) => {
    setErr("");
    try { const r = await api.site(s.siteId); setOpen({ site: r.site, releases: r.releases }); }
    catch (e) { setErr(e.message); }
  };

  const download = async (s, n) => {
    setErr("");
    try {
      const html = await api.source(s.siteId, n);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `${s.slug}-release-${n}.html` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { setErr(e.message); }
  };

  return (
    <>
      <div className="pagehead">
        <h1>My <em>films</em></h1>
        <p className="sub">Every portfolio is a versioned release on the CineFolio platform. Publishing flips an atomic pointer; rolling back flips it back in seconds.</p>
      </div>

      {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}
      {sites === null && <div className="mono"><span className="spin" style={{ marginRight: 10 }} />LOADING…</div>}

      {sites?.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: 48 }}>
          <div className="mono" style={{ marginBottom: 10 }}>NOTHING IN PRODUCTION YET</div>
          <h2 style={{ marginBottom: 18 }}>Your first film awaits, {user.email.split("@")[0]}.</h2>
          <button className="btn primary" onClick={() => nav("studio")}>Start a new film</button>
        </div>
      )}

      <div className="grid two">
        {sites?.map((s) => (
          <div key={s.siteId} className="panel sitecard">
            <div className="row1">
              <h3>{s.title}</h3>
              <span className={`badge ${s.status}`}>{s.status.replace("_", " ")}</span>
            </div>
            <div className="mono" style={{ textTransform: "none", letterSpacing: ".06em" }}>
              {s.slug} · release {s.liveRelease ?? "—"}/{s.releases}{s.pointerMode ? ` · ${s.pointerMode}` : ""}
            </div>
            <div className="btnrow" style={{ marginTop: 8 }}>
              {s.status === "live" && (
                <a className="btn ghost" href={s.previewUrl} target="_blank" rel="noopener noreferrer">View live</a>
              )}
              <button className="btn ghost" onClick={() => (open?.site?.siteId === s.siteId ? setOpen(null) : details(s))}>
                {open?.site?.siteId === s.siteId ? "Hide details" : "Details"}
              </button>
              {s.status !== "taken_down" && (
                <button className="btn danger" disabled={busyId === s.siteId} onClick={() => { if (window.confirm(`Take down ${s.slug}? Releases are kept.`)) act(s.siteId, () => api.takedown(s.siteId)); }}>
                  Take down
                </button>
              )}
            </div>

            {open?.site?.siteId === s.siteId && (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--faint)", paddingTop: 6 }}>
                <table>
                  <thead><tr><th>Release</th><th>Published</th><th></th></tr></thead>
                  <tbody>
                    {open.releases.map((r) => (
                      <tr key={r.n}>
                        <td>
                          #{r.n}{" "}
                          {open.site.liveRelease === r.n && <span className="badge live" style={{ marginLeft: 6 }}>LIVE</span>}
                        </td>
                        <td className="mono" style={{ textTransform: "none", letterSpacing: 0 }}>{(r.createdAt || "").slice(0, 16).replace("T", " ")}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {open.site.liveRelease !== r.n && open.site.status === "live" && (
                            <button className="btn ghost" style={{ padding: "7px 12px" }} disabled={busyId === s.siteId}
                              onClick={() => act(s.siteId, () => api.rollback(s.siteId, r.n))}>
                              Make live
                            </button>
                          )}{" "}
                          <button className="btn ghost" style={{ padding: "7px 12px" }} onClick={() => download(s, r.n)}>Source</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
