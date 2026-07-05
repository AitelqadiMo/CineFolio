// Dashboard — the client's films: releases, rollback, takedown.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { CONFIG } from "../config.js";
import { useAuth } from "../App.jsx";

export default function Dashboard() {
  const { user, nav } = useAuth();
  const [sites, setSites] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => api.sites().then((r) => setSites(r.sites)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const act = async (id, fn) => {
    setBusyId(id); setErr("");
    try { await fn(); await load(); } catch (e) { setErr(e.message); } finally { setBusyId(null); }
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
              {s.slug} · release {s.liveRelease ?? "—"}/{s.releases} {s.pointerMode ? `· ${s.pointerMode}` : ""}
            </div>
            <div className="btnrow" style={{ marginTop: 8 }}>
              {s.status === "live" && (
                <a className="btn ghost" href={`https://${CONFIG.sitesCdn}/`} target="_blank" rel="noopener noreferrer">View live</a>
              )}
              {s.releases > 1 && s.status === "live" && (
                <button className="btn ghost" disabled={busyId === s.siteId} onClick={() => act(s.siteId, () => api.rollback(s.siteId))}>
                  Roll back
                </button>
              )}
              {s.status !== "taken_down" && (
                <button className="btn danger" disabled={busyId === s.siteId} onClick={() => { if (window.confirm(`Take down ${s.slug}? Releases are kept.`)) act(s.siteId, () => api.takedown(s.siteId)); }}>
                  Take down
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
