// Sidebar: the one navigation rail every dashboard page shares. Anatomy
// follows the reference product exactly: workspace switcher, primary nav,
// a FILMS group with recents, promo cards, and the account row with its
// popover menu. All destinations are real routes; nothing decorative.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { usePopover } from "../media.js";

export default function Sidebar({ user, route, nav, onSignOut, onCmdK }) {
  const wsPop = usePopover();
  const userPop = usePopover();
  const [recents, setRecents] = useState([]);

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

      <button className="bkws" onClick={wsPop.toggle} aria-haspopup="menu" aria-expanded={wsPop.open}>
        <span className="wsavatar">{initial}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who}&apos;s Studio</span>
        <span className="chev" aria-hidden="true">▾</span>
      </button>
      {wsPop.open && (
        <div className="bkmenu" style={{ top: 96, left: 12 }} ref={wsPop.ref} role="menu">
          <div className="mhead"><span className="wsavatar" style={{ width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center", background: "linear-gradient(135deg, var(--bk-red-deep), var(--bk-gold))", fontSize: 11, fontWeight: 700 }}>{initial}</span>{who}&apos;s Studio</div>
          <button role="menuitem" onClick={() => { wsPop.close(false); nav("settings"); }}><span className="mi" aria-hidden="true">⚙</span>Studio settings</button>
          <button role="menuitem" onClick={() => { wsPop.close(false); nav("profile"); }}><span className="mi" aria-hidden="true">▣</span>My dossier</button>
        </div>
      )}

      <nav className="bknav" aria-label="Primary">
        <button className={is("home") ? "on" : ""} aria-current={is("home") ? "page" : undefined} onClick={() => nav("")}><i aria-hidden="true">⌂</i> Dashboard</button>
        <button onClick={onCmdK}><i aria-hidden="true">◌</i> Search <span className="kbd" aria-hidden="true"><b>⌘</b><b>K</b></span></button>
        <button className={is("resources") ? "on" : ""} aria-current={is("resources") ? "page" : undefined} onClick={() => nav("resources")}><i aria-hidden="true">◈</i> Resources</button>
        <button className={is("studio") ? "on" : ""} onClick={() => nav("studio")}><i aria-hidden="true">◉</i> The Set</button>

        <div className="navlbl">Films</div>
        <button className={is("films") ? "on" : ""} aria-current={is("films") ? "page" : undefined} onClick={() => nav("films")}><i aria-hidden="true">▦</i> All films</button>
        {user.admin && <button className={is("admin") ? "on" : ""} onClick={() => nav("admin")}><i aria-hidden="true">⛬</i> Production floor</button>}

        {recents.length > 0 && <div className="navlbl">Recents</div>}
        <div className="bkrecent">
          {recents.map((s) => (
            <button key={s.siteId} onClick={() => nav(`film/${s.siteId}`)} title={s.title}>{s.title || s.slug}</button>
          ))}
        </div>
      </nav>

      <button className="bkpromo" onClick={() => nav("films")}>
        <span><b>Share a premiere</b><i>Your films, one link each</i></span>
        <span className="pic" aria-hidden="true">↗</span>
      </button>
      <button className="bkpromo gold" onClick={() => nav("studio")}>
        <span><b>The Director&apos;s Cut</b><i>3 free AI cuts on us, then $149</i></span>
        <span className="pic" aria-hidden="true">◈</span>
      </button>

      <div className="bkuser">
        <button className="uava" onClick={userPop.toggle} aria-haspopup="menu" aria-expanded={userPop.open} aria-label="Account menu">{initial}</button>
        <span className="uwho" onClick={userPop.toggle}>{user.email}</span>
        {userPop.open && (
          <div className="bkmenu up" ref={userPop.ref} role="menu">
            <div className="mhead">{user.email}</div>
            <button role="menuitem" onClick={() => { userPop.close(false); nav("profile"); }}><span className="mi" aria-hidden="true">▣</span>My dossier</button>
            <button role="menuitem" onClick={() => { userPop.close(false); nav("settings"); }}><span className="mi" aria-hidden="true">⚙</span>Settings</button>
            <button role="menuitem" onClick={() => { userPop.close(false); sessionStorage.setItem("cf.openSupport", "1"); nav("settings"); }}><span className="mi" aria-hidden="true">◍</span>Support</button>
            <div className="msep" />
            <button role="menuitem" onClick={onSignOut}><span className="mi" aria-hidden="true">⇥</span>Sign out</button>
          </div>
        )}
      </div>
    </aside>
  );
}
