import { useState } from "react";
import { signIn, signUp, confirm, resendCode } from "../cognito.js";

export default function Login({ onBack }) {
  const [tab, setTab] = useState("signin"); // signin | signup | confirm
  const [email, setEmail] = useState(localStorage.getItem("cf.email") || "");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setErr(""); setMsg(""); setBusy(true);
    try { await fn(); } catch (e) {
      if (e.code === "UserNotConfirmedException") { setTab("confirm"); setMsg("Enter the code we emailed you."); }
      else setErr(e.message);
    } finally { setBusy(false); }
  };

  const submit = (e) => {
    e.preventDefault();
    if (tab === "signin") run(() => signIn(email.trim().toLowerCase(), pw));
    if (tab === "signup") run(async () => { await signUp(email.trim().toLowerCase(), pw); setTab("confirm"); setMsg("Account created. Check your email for the 6-digit code."); });
    if (tab === "confirm") run(async () => { await confirm(email.trim().toLowerCase(), code.trim()); setMsg("Confirmed. Signing you in…"); await signIn(email.trim().toLowerCase(), pw); });
  };

  return (
    <div className="authwrap">
      <form className="authcard" onSubmit={submit}>
        {onBack && (
          <button type="button" className="mono" onClick={onBack}
            style={{ background: "none", border: 0, color: "var(--dim)", cursor: "pointer", padding: 0, marginBottom: 26 }}>
            ← BACK TO THE SITE
          </button>
        )}
        <div className="lenshero" />
        <div className="mono" style={{ marginBottom: 10 }}>CINEFOLIO — STUDIO CONSOLE</div>
        <h1>Your career,<br /><em>in cinema.</em></h1>

        <div className="authtabs">
          <button type="button" className={tab === "signin" ? "on" : ""} onClick={() => setTab("signin")}>Sign in</button>
          <button type="button" className={tab === "signup" ? "on" : ""} onClick={() => setTab("signup")}>Create account</button>
          {tab === "confirm" && <button type="button" className="on">Confirm</button>}
        </div>

        <label className="mono">Email</label>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        {tab !== "confirm" && (<>
          <label className="mono">Password</label>
          <input type="password" required minLength={10} autoComplete={tab === "signin" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="10+ chars, upper + lower + number" />
        </>)}

        {tab === "confirm" && (<>
          <label className="mono">Confirmation code</label>
          <input inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code from your email" />
          {!pw && <><label className="mono">Password</label>
            <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="your password (to sign you in after)" /></>}
        </>)}

        {err && <div className="err">{err}</div>}
        {msg && !err && <div className="okmsg">{msg}</div>}

        <div className="btnrow">
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? <span className="spin" /> : null}
            {tab === "signin" ? "Enter the studio" : tab === "signup" ? "Create account" : "Confirm + sign in"}
          </button>
          {tab === "confirm" && (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => run(async () => { await resendCode(email.trim().toLowerCase()); setMsg("Fresh code sent."); })}>
              Resend code
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
