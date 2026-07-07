// Sidebar: the one navigation rail every dashboard page shares. Anatomy
// follows the reference product exactly: workspace switcher, primary nav,
// a FILMS group with recents, promo cards, and the account row with its
// popover menu. All destinations are real routes; nothing decorative.
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

function useClickAway(onAway) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onAway(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onAway]);
  return ref;
}

export default function Sidebar({ user, route, nav, onSignOut, onCmdK }) {
  const [menu, setMenu] = useState(null); // "ws" | "user" | null
  const [recents, setRecents] = useState([]);
  const menuRef = useClickAway(() => setMenu(null));

  useEffect(() => {
    api.sites().then((r) => {
      const list = [...(r.sites || [])]
        .sort((a, b) => String(b.updatedAt || b.publishedAt || "").localeCompare(String(a.updatedAt || a.publishedAt || "")))
        .slice(0, 4);
      setRecents(list);
    }).catch(() => { /* the rail works without recents */ });
  }, [route]);

  const who = user.email.split("@")[0];
  const initial = who.slice(0, 1).toUpperCase();
  const is = (r) => route === r || (r === "home" && (route === "" || route === "dashboard"));

  return (
    <aside className="bkside">
      <div className="bkside-top">
        <div className="brand"><span className="lens" />CINEFOLIO</div>
      </div>

      <button className="bkws" onClick={() => setMenu(menu === "ws" ? null : "ws")} aria-haspopup="menu" aria-expanded={menu === "ws"}>
        <span className="wsavatar">{initial}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who}&apos;s Studio</span>
        <span className="chev">▾</span>
      </button>
      {menu === "ws" && (
        <div className="bkmenu" style={{ top: 96, left: 12 }} ref={menuRef} role="menu">
          <div className="mhead"><span className="wsavatar" style={{ width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center", background: "linear-gradient(135deg, var(--bk-red-deep), var(--bk-gold))", fontSize: 11, fontWeight: 700 }}>{initial}</span>{who}&apos;s Studio</div>
          <button onClick={() => { setMenu(null); nav("settings"); }}><span className="mi">⚙</span>Studio settings</button>
          <button onClick={() => { setMenu(null); nav("profile"); }}><span className="mi">▣</span>My dossier</button>
        </div>
      )}

      <nav className="bknav" aria-label="Primary">
        <button className={is("home") ? "on" : ""} aria-current={is("home") ? "page" : undefined} onClick={() => nav("")}><i>⌂</i> Dashboard</button>
        <button onClick={onCmdK}><i>◌</i> Search <span className="kbd"><b>⌘</b><b>K</b></span></button>
        <button className={is("resources") ? "on" : ""} aria-current={is("resources") ? "page" : undefined} onClick={() => nav("resources")}><i>◈</i> Resources</button>
        <button className={is("studio") ? "on" : ""} onClick={() => nav("studio")}><i>◉</i> The Set</button>

        <div className="navlbl">Films</div>
        <button className={is("films") ? "on" : ""} aria-current={is("films") ? "page" : undefined} onClick={() => nav("films")}><i>▦</i> All films</button>
        {user.admin && <button className={is("admin") ? "on" : ""} onClick={() => nav("admin")}><i>⛬</i> Production floor</button>}

        {recents.length > 0 && <div className="navlbl">Recents</div>}
        <div className="bkrecent">
          {recents.map((s) => (
            <button key={s.siteId} onClick={() => nav(`film/${s.siteId}`)} title={s.title}>{s.title || s.slug}</button>
          ))}
        </div>
      </nav>

      <button className="bkpromo" onClick={() => nav("films")}>
        <span><b>Share a premiere</b><i>Your films, one link each</i></span>
        <span className="pic">↗</span>
      </button>
      <button className="bkpromo gold" onClick={() => nav("studio")}>
        <span><b>The Director&apos;s Cut</b><i>Filmed for you · $149</i></span>
        <span className="pic">◈</span>
      </button>

      <div className="bkuser">
        <button className="uava" onClick={() => setMenu(menu === "user" ? null : "user")} aria-haspopup="menu" aria-expanded={menu === "user"} aria-label="Account menu">{initial}</button>
        <span className="uwho" onClick={() => setMenu(menu === "user" ? null : "user")}>{user.email}</span>
        {menu === "user" && (
          <div className="bkmenu up" ref={menuRef} role="menu">
            <div className="mhead">{user.email}</div>
            <button onClick={() => { setMenu(null); nav("profile"); }}><span className="mi">▣</span>My dossier</button>
            <button onClick={() => { setMenu(null); nav("settings"); }}><span className="mi">⚙</span>Settings</button>
            <button onClick={() => { setMenu(null); sessionStorage.setItem("cf.openSupport", "1"); nav("settings"); }}><span className="mi">◍</span>Support</button>
            <div className="msep" />
            <button onClick={onSignOut}><span className="mi">⇥</span>Sign out</button>
          </div>
        )}
      </div>
    </aside>
  );
}
