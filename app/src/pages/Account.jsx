// Account v3: the client's record. Not a settings stub; the page that represents
// the person the studio is producing for. Identity, plan truth, orders with a
// permanent home, billing via the merchant of record, sites and domains,
// notifications, support, and ownership. UI-first: backend routes that are not
// wired yet degrade to honest fallbacks, never dead ends.
import { useEffect, useState } from "react";
import { api, notWired } from "../api.js";
import { CONFIG } from "../config.js";
import { useAuth } from "../App.jsx";
import { SplitTitle, Skeleton, friendly, Dialog, PromptDialog } from "../ui.jsx";
import { ledger } from "../orders.js";

const LS_ORDERS_URL = "https://app.lemonsqueezy.com/my-orders";
const STATUS_CLASS = { ready: "live", queued: "queued", filming: "filming", dispatch_failed: "dispatch_failed", human_review: "human_review", preview_only: "draft" };
const STATUS_LABEL = {
  ready: "delivered", queued: "in the queue", filming: "cameras rolling",
  dispatch_failed: "with the crew", human_review: "with the crew", preview_only: "preview only",
};

const domainIntents = () => { try { return JSON.parse(localStorage.getItem("cf.domainIntent") || "{}"); } catch { return {}; } };

export default function Account() {
  const { user, nav } = useAuth();
  const [form, setForm] = useState(null);
  const [plan, setPlan] = useState("free");
  const [sites, setSites] = useState(null);
  const [orders, setOrders] = useState(ledger.list());
  const [ordersWired, setOrdersWired] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [domains, setDomains] = useState(domainIntents());
  // dialogs
  const [support, setSupport] = useState(null);      // { subject, message, sent, busy, err } | null
  const [revising, setRevising] = useState(null);    // orderId | null
  const [domainFor, setDomainFor] = useState(null);  // site | null
  const [cnameFor, setCnameFor] = useState(null);    // { site, domain } | null

  useEffect(() => {
    api.me()
      .then((r) => { setForm({ name: r.user.name || "", company: r.user.company || "", links: r.user.links || "" }); setPlan(r.user.plan || "free"); })
      .catch((e) => setErr(friendly(e.message)));
    api.sites().then((r) => setSites(r.sites)).catch(() => setSites([]));
    ledger.sync().then((r) => { setOrders(r.orders); setOrdersWired(r.wired); }).catch(() => {});
    if (sessionStorage.getItem("cf.openSupport")) {
      sessionStorage.removeItem("cf.openSupport");
      setSupport({ subject: "", message: "" });
    }
  }, []);

  const isClient = ledger.isClient(orders) || plan !== "free";
  const planLabel = isClient ? "DIRECTOR'S CUT CLIENT" : "FREE TAKE";

  const save = async (e) => {
    e.preventDefault();
    setErr(""); setSaved(false); setBusy(true);
    try { await api.updateMe(form); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    catch (e2) { setErr(friendly(e2.message)); } finally { setBusy(false); }
  };

  const sendSupport = async () => {
    setSupport((s) => ({ ...s, busy: true, err: "" }));
    try {
      await api.contact({ email: user.email, subject: support.subject || "Studio support", message: support.message, source: "console" });
      setSupport((s) => ({ ...s, busy: false, sent: true }));
    } catch (e2) {
      setSupport((s) => ({ ...s, busy: false, err: friendly(e2.message) + " Your message is kept below so nothing is lost." }));
    }
  };

  const requestRevision = async (notes) => {
    const orderId = revising;
    setBusy(true);
    try {
      try {
        await api.requestRevision(orderId, { notes });
      } catch (e2) {
        if (!notWired(e2)) throw e2;
        // route pending: the request reaches the studio through the contact channel
        await api.contact({ email: user.email, subject: `Revision request, order ${orderId.slice(0, 8)}`, message: notes, source: "console-revision" });
      }
      ledger.patch(orderId, { revisionRequested: true });
      setOrders(ledger.list());
      setRevising(null);
    } catch (e2) { setErr(friendly(e2.message)); setRevising(null); }
    finally { setBusy(false); }
  };

  const connectDomain = async (domain) => {
    const site = domainFor;
    setBusy(true);
    try {
      try { await api.connectDomain(site.siteId, domain); }
      catch (e2) { if (!notWired(e2)) throw e2; }
      const next = { ...domains, [site.siteId]: domain };
      setDomains(next);
      try { localStorage.setItem("cf.domainIntent", JSON.stringify(next)); } catch { /* noop */ }
      setDomainFor(null);
      setCnameFor({ site, domain });
    } catch (e2) { setErr(friendly(e2.message)); setDomainFor(null); }
    finally { setBusy(false); }
  };

  const exportSite = async (s) => {
    setErr("");
    try {
      const html = await api.source(s.siteId);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `${s.slug}.html` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e2) { setErr(friendly(e2.message)); }
  };

  return (
    <>
      <div className="pagehead" data-scene="SCENE 04 · THE CLIENT RECORD">
        <SplitTitle text="Your" serif="account" />
        <p className="sub">Who the studio is producing for, what you own, and where your money went.</p>
      </div>

      {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}
      {!form && !err && <Skeleton h={260} style={{ maxWidth: 560 }} />}

      {form && (
        <div className="acct">

          {/* ---------- identity ---------- */}
          <form className="ticket" onSubmit={save}>
            <div className="tophalf">
              <div className="admit">ADMIT ONE · CINEFOLIO STUDIOS</div>
              <div className="name">{form.name || user.email.split("@")[0]}</div>
              <div className="mono" style={{ marginTop: 6, textTransform: "none", letterSpacing: ".06em" }}>{user.email}</div>
              <div style={{ marginTop: 10 }}>
                <span className={`badge ${isClient ? "live" : "draft"}`}>{planLabel}</span>
                {user.admin && <span className="badge live" style={{ marginLeft: 8 }}>OPERATOR</span>}
              </div>
            </div>
            <div className="bothalf">
              <label className="mono" htmlFor="acName">Name on the marquee</label>
              <input id="acName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nadia Benali" />
              <label className="mono" htmlFor="acCompany">Company / studio</label>
              <input id="acCompany" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Freelance" />
              <label className="mono" htmlFor="acLinks">Links (portfolio, GitHub, LinkedIn)</label>
              <input id="acLinks" value={form.links} onChange={(e) => setForm({ ...form, links: e.target.value })} placeholder="https://…" />
              {saved && !err && <div className="okmsg">Saved. The marquee is updated.</div>}
              <div className="btnrow"><button className="btn primary" disabled={busy}>{busy ? <span className="spin" /> : null}Save</button></div>
            </div>
          </form>

          <div className="acctcol">

            {/* ---------- plan ---------- */}
            <section className="asec" aria-label="Plan">
              <div className="scene-hd">PLAN</div>
              <div className="panel">
                <div className="planline">
                  <b>{isClient ? "Director's Cut client" : "Free take"}</b>
                  <span className={`badge ${isClient ? "live" : "draft"}`}>{planLabel}</span>
                </div>
                <ul className="planlist">
                  <li>Instant premieres on cinefolio.dev, always included</li>
                  {isClient ? <>
                    <li>Bespoke AI film pass, premiered within 24 hours</li>
                    <li>One revision included per Director's Cut</li>
                    <li>Your film stays yours: export any time</li>
                  </> : <li>The Director's Cut ($149, one time) adds a bespoke AI film pass with one revision included</li>}
                </ul>
                {(() => {
                  const paid = orders.filter((o) => o.production && o.status !== "preview_only");
                  const revLeft = paid.filter((o) => o.status === "ready" && !o.revisionRequested).length;
                  if (!paid.length) return null;
                  return (
                    <div style={{ marginTop: 16 }}>
                      <div className="mono" style={{ fontSize: 9 }}>STUDIO CREDITS · {paid.length} CUT{paid.length === 1 ? "" : "S"} OWNED · {revLeft} REVISION{revLeft === 1 ? "" : "S"} AVAILABLE</div>
                      <div style={{ height: 6, borderRadius: 3, background: "rgba(14,28,63,.12)", marginTop: 7, overflow: "hidden" }} aria-hidden="true">
                        <div style={{ width: `${Math.round((revLeft / paid.length) * 100)}%`, height: "100%", background: "linear-gradient(90deg,#C8102E,#D9A441,#0E9E62)" }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </section>

            {/* ---------- orders ---------- */}
            <section className="asec" aria-label="Orders">
              <div className="scene-hd">ORDERS</div>
              <div className="panel">
                {orders.length === 0 && (
                  <p className="dlgtext">No Director's Cut orders yet. When you order one from The Set, it lives here with its status, from queue to premiere.</p>
                )}
                {orders.map((o) => (
                  <div key={o.orderId} className="orderrow">
                    <div>
                      <b className="ordid">CUT · {o.orderId.slice(0, 8).toUpperCase()}</b>
                      <span className="mono ordmeta">{(o.at || "").slice(0, 10)}{o.name ? ` · ${o.name}` : ""}{o.price ? ` · $${o.price}` : ""}</span>
                    </div>
                    <div className="ordacts">
                      <span className={`badge ${STATUS_CLASS[o.status] || "queued"}`}>{STATUS_LABEL[o.status] || o.status}</span>
                      {o.status === "ready" && (
                        <>
                          <a className="btn ghost ordbtn" href={`${CONFIG.apiBase}/studio/cut?orderId=${encodeURIComponent(o.orderId)}`} target="_blank" rel="noopener noreferrer" title="Preview the delivered cut; case-study pages activate at premiere">Watch the cut</a>
                          <button type="button" className="btn primary ordbtn" onClick={() => { try { sessionStorage.setItem("cf.premiereCut", o.orderId); } catch { /* noop */ } nav("dashboard"); }}>Premiere</button>
                        </>
                      )}
                      {o.status === "ready" && !o.revisionRequested && (
                        <button type="button" className="btn ghost ordbtn" onClick={() => setRevising(o.orderId)}>Request revision</button>
                      )}
                      {o.revisionRequested && <span className="mono ordmeta">revision requested ✓</span>}
                    </div>
                  </div>
                ))}
                {!ordersWired && orders.length > 0 && (
                  <p className="mono finehint">Order history is kept on this device for now; studio-side history is on the way.</p>
                )}
              </div>
            </section>

            {/* ---------- billing ---------- */}
            <section className="asec" aria-label="Billing">
              <div className="scene-hd">BILLING &amp; RECEIPTS</div>
              <div className="panel">
                <p className="dlgtext">Payments run through Lemon Squeezy, our merchant of record. Every receipt and invoice lives in their portal, tied to {user.email}.</p>
                <div className="btnrow" style={{ marginTop: 12 }}>
                  <a className="btn ghost" href={LS_ORDERS_URL} target="_blank" rel="noopener noreferrer">Open my receipts ↗</a>
                </div>
              </div>
            </section>

            {/* ---------- sites & domains ---------- */}
            <section className="asec" aria-label="Sites and domains">
              <div className="scene-hd">SITES &amp; DOMAINS</div>
              <div className="panel">
                {sites === null && <Skeleton h={60} />}
                {sites?.length === 0 && <p className="dlgtext">No films premiered yet. Roll camera in The Set and your live sites appear here.</p>}
                {sites?.map((s) => (
                  <div key={s.siteId} className="orderrow">
                    <div>
                      <b className="ordid">{s.slug}.cinefolio.dev</b>
                      <span className="mono ordmeta">
                        {s.status === "live" ? "Live · hosted by the studio" : s.status.replace("_", " ")}
                        {domains[s.siteId] ? ` · ${domains[s.siteId]} pending setup` : ""}
                      </span>
                    </div>
                    <div className="ordacts">
                      {s.status === "live" && <a className="btn ghost ordbtn" href={s.previewUrl} target="_blank" rel="noopener noreferrer">Open</a>}
                      <button type="button" className="btn ghost ordbtn" onClick={() => (domains[s.siteId] ? setCnameFor({ site: s, domain: domains[s.siteId] }) : setDomainFor(s))}>
                        {domains[s.siteId] ? "Domain setup" : "Connect domain"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ---------- notifications ---------- */}
            <section className="asec" aria-label="Notifications">
              <div className="scene-hd">NOTIFICATIONS</div>
              <div className="panel">
                <p className="dlgtext">The studio writes to <b>{user.email}</b> at the moments that matter:</p>
                <ul className="planlist">
                  <li>Order received, with your order number</li>
                  <li>Your Director's Cut premiere</li>
                  <li>Revision delivered</li>
                </ul>
              </div>
            </section>

            {/* ---------- support ---------- */}
            <section className="asec" aria-label="Support">
              <div className="scene-hd">SUPPORT</div>
              <div className="panel">
                <p className="dlgtext">A person reads these. Questions about an order, a revision, billing, anything.</p>
                <div className="btnrow" style={{ marginTop: 12 }}>
                  <button type="button" className="btn primary" onClick={() => setSupport({ subject: "", message: "" })}>Reach the studio</button>
                </div>
              </div>
            </section>

            {/* ---------- ownership ---------- */}
            <section className="asec" aria-label="Ownership">
              <div className="scene-hd">OWNERSHIP</div>
              <div className="panel">
                <p className="dlgtext"><b>Your film is yours.</b> Export the full source of any release, point your own domain at it, and leave whenever you like. No lock-in, ever.</p>
                {sites?.filter((s) => s.releases > 0).map((s) => (
                  <div key={s.siteId} className="btnrow" style={{ marginTop: 10 }}>
                    <button type="button" className="btn ghost ordbtn" onClick={() => exportSite(s)}>Export {s.slug}.html</button>
                  </div>
                ))}
                <div className="btnrow" style={{ marginTop: 14 }}>
                  <button type="button" className="btn danger ordbtn" onClick={() => setSupport({ subject: "Delete my account", message: "Please delete my account and all my data." })}>
                    Delete my account
                  </button>
                </div>
              </div>
            </section>

          </div>
        </div>
      )}

      {/* ---------- dialogs ---------- */}
      <Dialog open={!!support} title={support?.sent ? "On its way" : "Reach the studio"} kicker="SUPPORT" onClose={() => setSupport(null)}>
        {support?.sent ? (
          <>
            <div className="dlgtext">Received. A person will reply to <b>{user.email}</b>, usually within a day.</div>
            <div className="btnrow" style={{ marginTop: 16 }}><button type="button" className="btn primary" onClick={() => setSupport(null)}>Done</button></div>
          </>
        ) : support && (
          <>
            <label className="mono" htmlFor="supSubject">Subject</label>
            <input id="supSubject" value={support.subject} onChange={(e) => setSupport({ ...support, subject: e.target.value })} placeholder="What is this about?" />
            <label className="mono" htmlFor="supMsg">Message</label>
            <textarea id="supMsg" value={support.message} onChange={(e) => setSupport({ ...support, message: e.target.value })} placeholder="Tell us what's going on. Order numbers help." style={{ minHeight: 110 }} />
            {support.err && <div className="err" style={{ marginTop: 10 }}>{support.err}</div>}
            <div className="btnrow" style={{ marginTop: 16 }}>
              <button type="button" className="btn primary" disabled={support.busy || !support.message?.trim()} onClick={sendSupport}>
                {support.busy ? <span className="spin" /> : null}Send to the studio
              </button>
              <button type="button" className="btn ghost" onClick={() => setSupport(null)}>Cancel</button>
            </div>
          </>
        )}
      </Dialog>

      <PromptDialog
        open={!!revising} kicker="ONE REVISION INCLUDED" title="Request a revision"
        body="Tell the studio what should change. Be specific: sections, tone, imagery, anything."
        placeholder="What should we change in this cut?" submitLabel="Send revision request" busy={busy}
        onSubmit={requestRevision} onClose={() => setRevising(null)}
      />

      <PromptDialog
        open={!!domainFor} kicker="CUSTOM DOMAIN" title="Connect your own domain"
        body="Enter the domain you own. We'll hand you the exact DNS record to add."
        placeholder="yourname.com" busy={busy}
        validate={(v) => (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v.trim()) ? "" : "Enter a domain like yourname.com")}
        preview={(v) => `${v} → ${domainFor?.slug}.cinefolio.dev`}
        submitLabel="Get setup steps" onSubmit={connectDomain} onClose={() => setDomainFor(null)}
      />

      <Dialog open={!!cnameFor} title="Point your domain" kicker="DNS SETUP" onClose={() => setCnameFor(null)} width={560}>
        {cnameFor && (
          <>
            <div className="dlgtext">At your domain registrar, add this record to <b>{cnameFor.domain}</b>:</div>
            <div className="cnamebox mono">
              TYPE&nbsp;&nbsp;&nbsp;CNAME<br />
              NAME&nbsp;&nbsp;&nbsp;{cnameFor.domain}<br />
              VALUE&nbsp;&nbsp;{CONFIG.sitesCdn}
            </div>
            <div className="dlgtext" style={{ marginTop: 12 }}>
              DNS changes take minutes to a few hours. The studio finishes the TLS handshake on our side; if your domain is not live within a day, reach the studio from Support and a person will take it from there.
            </div>
            <div className="btnrow" style={{ marginTop: 16 }}>
              <button type="button" className="btn primary" onClick={() => setCnameFor(null)}>Got it</button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
