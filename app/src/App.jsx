import { useEffect, useState, createContext, useContext, Component } from "react";
import { getUser, onAuthChange, restore, signOut } from "./cognito.js";
import { CONFIG } from "./config.js";
import Landing from "./marketing/Landing.jsx";
import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import Films from "./pages/Films.jsx";
import Resources from "./pages/Resources.jsx";
import Editor from "./pages/Editor.jsx";
import Settings from "./pages/Settings.jsx";
import Studio from "./pages/Studio.jsx";
import Admin from "./pages/Admin.jsx";
import Profile from "./pages/Profile.jsx";
import Sidebar from "./shell/Sidebar.jsx";
import CmdK from "./CmdK.jsx";
import ToastHost from "./shell/Toast.jsx";
import { api } from "./api.js";
import { ledger } from "./orders.js";

export const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// A page crash must never white-screen the console: kill the lights, not the set.
class SetBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error("set failure:", err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="authwrap" style={{ background: "var(--bk-bg)", color: "var(--bk-ink)" }}><div style={{ textAlign: "center", maxWidth: 460 }}>
        <div className="mono" style={{ color: "var(--bk-red)", marginBottom: 12 }}>⚡ THE SET LOST POWER</div>
        <h2 style={{ marginBottom: 10, color: "var(--bk-ink)" }}>A fuse blew on <em>this scene.</em></h2>
        <p style={{ color: "var(--bk-dim)", marginBottom: 18 }}>The rest of the studio is fine. Relight the floor, and if this repeats, the crew is already alarmed about it.</p>
        <button className="bkbtn primary" onClick={() => { this.setState({ err: null }); location.reload(); }}>Relight the set</button>
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
  const [edge, setEdge] = useState(null); // { ms } ambient status
  const [prod, setProd] = useState(null); // global director's-cut tracking
  const [credits, setCredits] = useState(() => ledger.credits());

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

  // global production tracker: The Set stores cf.activeOrder; the shell owns polling
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
        ledger.setStatus(o.orderId, st.status);
      } catch { /* transient */ }
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);

  useEffect(() => { setCredits(ledger.credits()); }, [route, prod]);

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

  /* ---------- authenticated: the backlot ---------- */
  const seg = route.split("/");
  const head = seg[0];
  const openCmdK = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  const doSignOut = () => { signOut(); nav(""); };

  const statusChips = (
    <div className="bkstatus">
      {prod && (
        <button className={`bkchip ${prod.status === "ready" ? "green" : ["human_review", "dispatch_failed"].includes(prod.status) ? "red" : "gold"}`}
          onClick={() => nav(prod.status === "ready" ? "films" : "settings")} title="Director's cut order status">
          {prod.status === "ready" ? "🎬 CUT READY" : ["human_review", "dispatch_failed"].includes(prod.status) ? "⚠ NEEDS ATTENTION" : prod.status === "filming" ? "● CAMERAS ROLLING" : "● IN THE QUEUE"}
        </button>
      )}
      {credits.cuts > 0 && (
        <button className="bkchip gold" onClick={() => nav("settings")} title="Studio credits">◈ {credits.revisions} REVISION{credits.revisions === 1 ? "" : "S"} LEFT</button>
      )}
      <span className="bkchip plain">{CONFIG.env.toUpperCase()}</span>
      {edge && (edge.ms >= 0
        ? <span className="bkchip plain green">{edge.ms}MS</span>
        : <span className="bkchip plain red">OFFLINE</span>)}
    </div>
  );

  /* editor routes screen full-bleed, exactly like the reference */
  if (head === "film" && seg[1]) {
    return (
      <AuthCtx.Provider value={{ user, nav }}>
        <CmdK nav={nav} admin={user.admin} />
        <ToastHost />
        <SetBoundary key={route}><Editor siteId={seg[1]} /></SetBoundary>
      </AuthCtx.Provider>
    );
  }
  if (head === "studio") {
    return (
      <AuthCtx.Provider value={{ user, nav }}>
        <CmdK nav={nav} admin={user.admin} />
        <ToastHost />
        <SetBoundary key={route}>
          <div className="edshell">
            <div className="edbar">
              <button className="edproj" onClick={() => nav("")}>
                <span className="lens" aria-hidden="true" /><span>The Set · new film</span>
              </button>
              <div className="grow" />
              <button className="bkbtn ghost" style={{ padding: "6px 14px" }} onClick={() => nav("films")}>My films</button>
              <button className="bkbtn ghost" style={{ padding: "6px 14px" }} onClick={() => nav("")}>Dashboard</button>
            </div>
            <div className="setbody"><Studio /></div>
          </div>
        </SetBoundary>
      </AuthCtx.Provider>
    );
  }

  /* dashboard routes share the one sidebar */
  const PAGES = {
    "": Home, dashboard: Home, films: Films, resources: Resources,
    settings: Settings, account: Settings, admin: Admin, profile: Profile,
  };
  const Page = PAGES[head] || Home;
  const onCanvas = head === "admin" || head === "profile";

  return (
    <AuthCtx.Provider value={{ user, nav }}>
      <CmdK nav={nav} admin={user.admin} />
      <ToastHost />
      <div className="backlot">
        <Sidebar user={user} route={head} nav={nav} onSignOut={doSignOut} onCmdK={openCmdK} />
        <div className="bkmain">
          {statusChips}
          <main className="bkpage">
            <SetBoundary key={route}>
              {onCanvas
                ? <div className="bkpad"><div className="bkcanvaspage"><Page /></div></div>
                : <Page />}
            </SetBoundary>
          </main>
        </div>
      </div>
    </AuthCtx.Provider>
  );
}
