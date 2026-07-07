// Settings: the reference settings anatomy, one nav column and stacked
// cards. The client record (Account) screens on a light canvas inside the
// dark backlot; the nav anchors scroll to its real sections.
import { useEffect, useRef, useState } from "react";
import Account from "./Account.jsx";

const SECTIONS = [
  { group: "Account", items: [{ id: "top", label: "Your account", icon: "✦" }] },
  { group: "Studio", items: [
    { id: "orders", label: "Orders & credits", icon: "◈" },
    { id: "export", label: "Source export", icon: "▤" },
  ] },
  { group: "Support", items: [{ id: "support", label: "Get help", icon: "◍" }] },
];

export default function Settings() {
  const mainRef = useRef(null);
  const [on, setOn] = useState("top");

  useEffect(() => {
    // opened with a support intent from the sidebar menu
    if (sessionStorage.getItem("cf.openSupport")) setOn("support");
  }, []);

  const go = (id) => {
    setOn(id);
    const host = mainRef.current;
    if (!host) return;
    if (id === "top") { host.closest(".bkpage")?.scrollTo({ top: 0, behavior: "smooth" }); return; }
    // best-effort anchor: find a heading mentioning the section
    const needle = { orders: "order", export: "export", support: "support" }[id] || id;
    const el = [...host.querySelectorAll("h1, h2, h3, .scene-hd, .mono")].find((n) => n.textContent.toLowerCase().includes(needle));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="bkpad">
      <div className="bkpagehead"><h1>Settings</h1></div>
      <div className="setwrap">
        <nav className="setnav" aria-label="Settings">
          {SECTIONS.map((g) => (
            <div key={g.group}>
              <div className="navlbl">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.id} className={on === it.id ? "on" : ""} onClick={() => go(it.id)}>
                  <span style={{ width: 16, textAlign: "center" }}>{it.icon}</span>{it.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="setmain">
          <div className="bkcanvaspage" ref={mainRef}>
            <Account />
          </div>
        </div>
      </div>
    </div>
  );
}
