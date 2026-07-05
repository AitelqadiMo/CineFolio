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
      <header className="topbar">
        <div className="brand"><span className="lens" />CINEFOLIO <span className="mono" style={{ color: "var(--gold)" }}>STUDIO</span></div>
        <nav className="nav">
          <button className={route === "dashboard" ? "on" : ""} onClick={() => nav("dashboard")}>My Films</button>
          <button className={route === "studio" ? "on" : ""} onClick={() => nav("studio")}>New Film</button>
          {user.admin && <button className={route === "admin" ? "on" : ""} onClick={() => nav("admin")}>Orders</button>}
          <button className={route === "account" ? "on" : ""} onClick={() => nav("account")}>Account</button>
          <button onClick={() => { signOut(); nav(""); }}>Sign out</button>
          <span className="kbdhint mono" title="Command palette">⌘K</span>
        </nav>
      </header>
      <main className={route === "studio" ? "page pagewide" : "page"}><SetBoundary key={route}><Page /></SetBoundary></main>
      <footer className="footer">
        <span className="mono">CINEFOLIO STUDIOS — {CONFIG.env.toUpperCase()}</span>
        <span className="mono">
          {edge && (edge.ms >= 0
            ? <><i className="edgedot ok" /> EDGE OK · {edge.ms}MS · EU-CENTRAL-1 · </>
            : <><i className="edgedot bad" /> EDGE UNREACHABLE · </>)}
          {user.email}
        </span>
      </footer>
    </AuthCtx.Provider>
  );
}
