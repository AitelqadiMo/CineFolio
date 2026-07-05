import { useEffect, useState, createContext, useContext, Component } from "react";
import { getUser, onAuthChange, restore, signOut } from "./cognito.js";
import { CONFIG } from "./config.js";
import Landing from "./marketing/Landing.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Studio from "./pages/Studio.jsx";
import Admin from "./pages/Admin.jsx";
import Account from "./pages/Account.jsx";
import CmdK from "./CmdK.jsx";
import { api } from "./api.js";

export const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const PAGES = { dashboard: Dashboard, studio: Studio, admin: Admin, account: Account };

// A page crash must never white-screen the console — kill the lights, not the set.
class SetBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("set failure:", err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="authwrap"><div style={{ textAlign: "center", maxWidth: 460 }}>
        <div className="mono" style={{ color: "var(--red)", marginBottom: 12 }}>⚡ THE SET LOST POWER</div>
        <h2 style={{ marginBottom: 10 }}>A fuse blew on <em>this scene.</em></h2>
        <p style={{ color: "var(--dim)", marginBottom: 18 }}>The rest of the studio is fine. Reload the floor — and if this repeats, the crew is already alarmed about it.</p>
        <button className="btn primary" onClick={() => { this.setState({ err: null }); location.reload(); }}>Relight the set</button>
      </div></div>
    );
  }
}

function path() {
  return location.pathname.replace(/^\/+|\/+$/g, "") || "";
}

export default function App() {
  const [user, setUser] = useState(getUser());
  const [booting, setBooting] = useState(true);
  const [route, setRoute] = useState(path());
  const [edge, setEdge] = useState(null); // { ms } — ambient status, platform-style
  const [prod, setProd] = useState(null); // global director's-cut tracking (survives navigation)

  useEffect(() => {
    restore().finally(() => setBooting(false));
    const off = onAuthChange(setUser);
    const onPop = () => setRoute(path());
    window.addEventListener("popstate", onPop);
    return () => { off(); window.removeEventListener("popstate", onPop); };
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const ping = async () => {
      const t0 = performance.now();
      try { await api.health(); if (alive) setEdge({ ms: Math.round(performance.now() - t0) }); }
      catch { if (alive) setEdge({ ms: -1 }); }
    };
    ping();
    const t = setInterval(ping, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);

  // global production tracker: Studio stores cf.activeOrder; the shell owns polling
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const tick = async () => {
      let o = null;
      try { o = JSON.parse(localStorage.getItem("cf.activeOrder") || "null"); } catch { /* noop */ }
      if (!o) { if (alive) setProd(null); return; }
      try {
        const st = await api.orderStatus(o.orderId);
        if (!alive) return;
        setProd({ ...o, status: st.status, failCause: st.failCause });
        if (["ready", "human_review", "dispatch_failed"].includes(st.status)) {
          setTimeout(() => { localStorage.removeItem("cf.activeOrder"); }, 120000); // linger 2 min then clear
        }
      } catch { /* transient */ }
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);

  const nav = (to) => {
    history.pushState({}, "", `/${to}`);
    setRoute(to);
  };

  if (booting) {
    return <div className="authwrap"><div className="mono"><span className="spin" style={{ marginRight: 10 }} />LOADING THE STUDIO…</div></div>;
  }

  /* ---------- public: cinematic landing + login ---------- */
  if (!user) {
    if (route === "login") return <Login onBack={() => nav("")} />;
    return <Landing onEnter={() => nav("login")} />;
  }

  /* ---------- authenticated: studio console ---------- */
  const Page = PAGES[route] || Dashboard;
  return (
    <AuthCtx.Provider value={{ user, nav }}>
      <div className="aurora" aria-hidden="true" />
      <CmdK nav={nav} admin={user.admin} />
      <div className="shell">
        <aside className="side">
          <div className="brand" style={{ padding: "18px 16px" }}><span className="lens" />CINEFOLIO</div>
          <nav className="sidenav">
            <div className="mono sidelabel">PRODUCTION</div>
            <button className={route === "dashboard" || route === "" ? "on" : ""} onClick={() => nav("dashboard")}><i>▦</i> My Films</button>
            <button className={route === "studio" ? "on" : ""} onClick={() => nav("studio")}><i>◉</i> The Set</button>
            {user.admin && (<>
              <div className="mono sidelabel">OPERATIONS</div>
              <button className={route === "admin" ? "on" : ""} onClick={() => nav("admin")}><i>⛬</i> Floor</button>
            </>)}
            <div className="mono sidelabel">STUDIO</div>
            <button className={route === "account" ? "on" : ""} onClick={() => nav("account")}><i>✦</i> Account</button>
          </nav>
          <div className="sideuser">
            <div className="mono" style={{ textTransform: "none", letterSpacing: ".04em", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
            <button className="mono sideout" onClick={() => { signOut(); nav(""); }}>SIGN OUT</button>
          </div>
        </aside>
        <div className="shellmain">
          <header className="shellhead">
            <span className="mono crumb">{route === "studio" ? "THE SET" : route === "admin" ? "PRODUCTION FLOOR" : route === "account" ? "ACCOUNT" : "MY FILMS"}</span>
            <span style={{ flex: 1 }} />
            {prod && (
              <button className={`prodchip mono ${prod.status}`} onClick={() => nav("studio")} title="Director's cut production">
                {prod.status === "ready" ? "🎬 CUT READY" :
                 ["human_review", "dispatch_failed"].includes(prod.status) ? "⚠ NEEDS ATTENTION" :
                 <><i className="recdot" />{prod.status === "filming" ? "CAMERAS ROLLING" : "IN THE QUEUE"}</>}
              </button>
            )}
            <span className="mono envbadge">{CONFIG.env.toUpperCase()}</span>
            {edge && (edge.ms >= 0
              ? <span className="mono edgetag"><i className="edgedot ok" />{edge.ms}MS</span>
              : <span className="mono edgetag"><i className="edgedot bad" />OFFLINE</span>)}
            <span className="kbdhint mono" title="Command palette">⌘K</span>
          </header>
          <main className={route === "studio" ? "page pagewide" : "page"}><SetBoundary key={route}><Page /></SetBoundary></main>
        </div>
      </div>
    </AuthCtx.Provider>
  );
}
