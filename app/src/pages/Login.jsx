import { useState } from "react";
import { signIn, signUp, confirm, resendCode, forgotPassword, confirmForgotPassword } from "../cognito.js";
import { track, STEP } from "../funnel.js";

export default function Login({ onBack }) {
  const [tab, setTab] = useState("signin"); // signin | signup | confirm | forgot | reset
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
    if (tab === "confirm") run(async () => { await confirm(email.trim().toLowerCase(), code.trim()); track(STEP.signupComplete); setMsg("Confirmed. Signing you in…"); await signIn(email.trim().toLowerCase(), pw); });
    // forgot: email the reset code, then move to the reset step. We do NOT leak
    // whether the account exists (Cognito returns success either way with
    // prevent_user_existence_errors on), so the copy stays neutral.
    if (tab === "forgot") run(async () => { await forgotPassword(email.trim().toLowerCase()); setCode(""); setPw(""); setTab("reset"); setMsg("If that email has an account, a reset code is on its way. Enter it below with a new password."); });
    if (tab === "reset") run(async () => { await confirmForgotPassword(email.trim().toLowerCase(), code.trim(), pw); setMsg("Password reset. Signing you in…"); await signIn(email.trim().toLowerCase(), pw); });
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
        <div className="mono" style={{ marginBottom: 10 }}>CINEFOLIO · STUDIO CONSOLE</div>
        <h1>Your career,<br /><em>in cinema.</em></h1>

        <div className="authtabs">
          <button type="button" className={tab === "signin" ? "on" : ""} onClick={() => setTab("signin")}>Sign in</button>
          <button type="button" className={tab === "signup" ? "on" : ""} onClick={() => { track(STEP.signupStart); setTab("signup"); }}>Create account</button>
          {tab === "confirm" && <button type="button" className="on">Confirm</button>}
          {(tab === "forgot" || tab === "reset") && <button type="button" className="on">Reset password</button>}
        </div>

        <label className="mono">Email</label>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        {/* signin + signup: password. forgot: email only. reset: code + new password. */}
        {(tab === "signin" || tab === "signup") && (<>
          <label className="mono">Password</label>
          <input type="password" required minLength={10} autoComplete={tab === "signin" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="10+ chars, upper + lower + number" />
        </>)}

        {tab === "confirm" && (<>
          <label className="mono">Confirmation code</label>
          <input inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code from your email" />
          {!pw && <><label className="mono">Password</label>
            <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="your password (to sign you in after)" /></>}
        </>)}

        {tab === "reset" && (<>
          <label className="mono">Reset code</label>
          <input inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code from your email" />
          <label className="mono">New password</label>
          <input type="password" required minLength={10} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="10+ chars, upper + lower + number" />
        </>)}

        {err && <div className="err">{err}</div>}
        {msg && !err && <div className="okmsg">{msg}</div>}

        <div className="btnrow">
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? <span className="spin" /> : null}
            {tab === "signin" ? "Enter the studio" : tab === "signup" ? "Create account" : tab === "confirm" ? "Confirm + sign in" : tab === "forgot" ? "Send reset code" : "Reset + sign in"}
          </button>
          {tab === "confirm" && (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => run(async () => { await resendCode(email.trim().toLowerCase()); setMsg("Fresh code sent."); })}>
              Resend code
            </button>
          )}
          {tab === "reset" && (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => run(async () => { await forgotPassword(email.trim().toLowerCase()); setMsg("Fresh code sent."); })}>
              Resend code
            </button>
          )}
        </div>

        {/* the recovery entry point: a signed-out user who forgot their password
            had no self-serve path at all before this. Only shown on sign in. */}
        {tab === "signin" && (
          <button type="button" className="mono" onClick={() => { setErr(""); setMsg(""); setPw(""); setCode(""); setTab("forgot"); }}
            style={{ background: "none", border: 0, color: "var(--dim)", cursor: "pointer", padding: 0, marginTop: 16 }}>
            Forgot your password?
          </button>
        )}
        {(tab === "forgot" || tab === "reset") && (
          <button type="button" className="mono" onClick={() => { setErr(""); setMsg(""); setTab("signin"); }}
            style={{ background: "none", border: 0, color: "var(--dim)", cursor: "pointer", padding: 0, marginTop: 16 }}>
            ← Back to sign in
          </button>
        )}
      </form>
    </div>
  );
}
