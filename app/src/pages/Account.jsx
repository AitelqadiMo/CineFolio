// Account v2: a ticket stub, because every client is on the marquee.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { SplitTitle, Skeleton, friendly } from "../ui.jsx";

export default function Account() {
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [plan, setPlan] = useState("free");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.me()
      .then((r) => { setForm({ name: r.user.name || "", company: r.user.company || "", links: r.user.links || "" }); setPlan(r.user.plan || "free"); })
      .catch((e) => setErr(friendly(e.message)));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setErr(""); setSaved(false); setBusy(true);
    try { await api.updateMe(form); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    catch (e2) { setErr(friendly(e2.message)); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="pagehead" data-scene="SCENE 04 · THE MARQUEE">
        <SplitTitle text="Account" serif="settings" />
        <p className="sub">Who the studio is producing for.</p>
      </div>

      {!form && !err && <Skeleton h={260} style={{ maxWidth: 560 }} />}
      {err && !form && <div className="err">{err}</div>}

      {form && (
        <form className="ticket" onSubmit={save}>
          <div className="tophalf">
            <div className="admit">ADMIT ONE · CINEFOLIO STUDIOS</div>
            <div className="name">{form.name || user.email.split("@")[0]}</div>
            <div className="mono" style={{ marginTop: 6, textTransform: "none", letterSpacing: ".06em" }}>{user.email}</div>
            <div style={{ marginTop: 10 }}>
              <span className="badge draft">{plan.toUpperCase()} PLAN</span>
              {user.admin && <span className="badge live" style={{ marginLeft: 8 }}>OPERATOR</span>}
            </div>
          </div>
          <div className="bothalf">
            <label className="mono">Name on the marquee</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nadia Benali" />
            <label className="mono">Company / studio</label>
            <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Freelance" />
            <label className="mono">Links (portfolio, GitHub, LinkedIn)</label>
            <input value={form.links} onChange={(e) => setForm({ ...form, links: e.target.value })} placeholder="https://…" />
            {err && <div className="err">{err}</div>}
            {saved && !err && <div className="okmsg">Saved. The marquee is updated.</div>}
            <div className="btnrow"><button className="btn primary" disabled={busy}>{busy ? <span className="spin" /> : null}Save</button></div>
          </div>
        </form>
      )}
    </>
  );
}
