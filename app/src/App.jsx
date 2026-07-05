import { useEffect, useState, createContext, useContext } from "react";
import { getUser, onAuthChange, restore, signOut } from "./cognito.js";
import { CONFIG } from "./config.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Studio from "./pages/Studio.jsx";
import Admin from "./pages/Admin.jsx";
import Account from "./pages/Account.jsx";

export const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const PAGES = { dashboard: Dashboard, studio: Studio, admin: Admin, account: Account };

function path() {
  return location.pathname.replace(/^\/+|\/+$/g, "") || "dashboard";
}

export default function App() {
  const [user, setUser] = useState(getUser());
  const [booting, setBooting] = useState(true);
  const [route, setRoute] = useState(path());

  useEffect(() => {
    restore().finally(() => setBooting(false));
    const off = onAuthChange(setUser);
    const onPop = () => setRoute(path());
    window.addEventListener("popstate", onPop);
    return () => { off(); window.removeEventListener("popstate", onPop); };
  }, []);

  const nav = (to) => {
    history.pushState({}, "", `/${to}`);
    setRoute(to);
  };

  if (booting) {
    return <div className="authwrap"><div className="mono"><span className="spin" style={{ marginRight: 10 }} />LOADING THE STUDIO…</div></div>;
  }
  if (!user) return <Login />;

  const Page = PAGES[route] || Dashboard;
  return (
    <AuthCtx.Provider value={{ user, nav }}>
      <header className="topbar">
        <div className="brand"><span className="lens" />CINEFOLIO <span className="mono" style={{ color: "var(--gold)" }}>STUDIO</span></div>
        <nav className="nav">
          <button className={route === "dashboard" ? "on" : ""} onClick={() => nav("dashboard")}>My Films</button>
          <button className={route === "studio" ? "on" : ""} onClick={() => nav("studio")}>New Film</button>
          {user.admin && <button className={route === "admin" ? "on" : ""} onClick={() => nav("admin")}>Orders</button>}
          <button className={route === "account" ? "on" : ""} onClick={() => nav("account")}>Account</button>
          <button onClick={() => { signOut(); }}>Sign out</button>
        </nav>
      </header>
      <main className="page"><Page /></main>
      <footer className="footer">
        <span className="mono">CINEFOLIO STUDIOS — {CONFIG.env.toUpperCase()}</span>
        <span className="mono">{user.email}</span>
      </footer>
    </AuthCtx.Provider>
  );
}
