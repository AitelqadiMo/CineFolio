// Account — profile settings backed by GET/PUT /me.
import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Account() {
  const [form, setForm] = useState(null);
  const [plan, setPlan] = useState("free");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.me()
      .then((r) => { setForm({ name: r.user.name || "", company: r.user.company || "", links: r.user.links || "" }); setPlan(r.user.plan || "free"); })
      .catch((e) => setErr(e.message));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setErr(""); setSaved(false); setBusy(true);
    try { await api.updateMe(form); setSaved(true); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  if (!form && !err) return <div className="mono"><span className="spin" style={{ marginRight: 10 }} />LOADING…</div>;

  return (
    <>
      <div className="pagehead">
        <h1>Account <em>settings</em></h1>
        <p className="sub">Who the studio is producing for. Plan: <span className="badge draft" style={{ marginLeft: 6 }}>{plan.toUpperCase()}</span></p>
      </div>
      {form && (
        <form className="panel" onSubmit={save} style={{ maxWidth: 560 }}>
          <label className="mono">Display name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nadia Benali" />
          <label className="mono">Company / studio</label>
          <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Freelance" />
          <label className="mono">Links (portfolio, GitHub, LinkedIn)</label>
          <input value={form.links} onChange={(e) => setForm({ ...form, links: e.target.value })} placeholder="https://…" />
          {err && <div className="err">{err}</div>}
          {saved && !err && <div className="okmsg">Saved.</div>}
          <div className="btnrow"><button className="btn primary" disabled={busy}>{busy ? <span className="spin" /> : null}Save</button></div>
        </form>
      )}
      {err && !form && <div className="err">{err}</div>}
    </>
  );
}
