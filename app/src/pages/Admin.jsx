// Admin v3: the production floor becomes an operations console. Desks on real
// data: Overview (platform stats + audience), Revenue (the 1000 USD chase),
// Films (every site on the platform, with moderation), Orders (the pipeline
// kanban), People, Inbox, Funnel (where signups drop off), and Controls (the
// pipeline kill switch). Admin group enforced server-side on every route; this
// page is just the window.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { SplitTitle, Skeleton, friendly, ConfirmDialog, Dialog } from "../ui.jsx";

const TABS = [
  { k: "overview", label: "Overview" },
  { k: "revenue", label: "Revenue" },
  { k: "films", label: "Films" },
  { k: "orders", label: "Orders" },
  { k: "people", label: "People" },
  { k: "inbox", label: "Inbox" },
  { k: "funnel", label: "Funnel" },
  { k: "controls", label: "Controls" },
];

// The funnel vocabulary in stage order, mirroring FUNNEL_STEPS on the server, so
// this desk can render a plain-English label and a one-line meaning for each of
// the nine steps the report walks. The order here IS the drop-off order.
const FUNNEL_LABELS = {
  landing_view: { label: "Landing viewed", note: "The marketing landing rendered for a visitor." },
  signup_start: { label: "Sign-up started", note: "Someone opened create-account and touched a field." },
  signup_complete: { label: "Account confirmed", note: "The Cognito confirmation succeeded." },
  profile_uploaded: { label: "Portfolio saved", note: "A dossier was saved to the studio." },
  film_generated: { label: "AI cut returned", note: "An AI cut came back from the director." },
  film_published: { label: "Film published", note: "A film went live for an audience." },
  pricing_view: { label: "Pricing seen", note: "The register or pricing surface was viewed." },
  checkout_click: { label: "Checkout clicked", note: "The buyer clicked through to Creem checkout." },
  purchase: { label: "Purchase cleared", note: "A paid credit landed, webhook-confirmed." },
};

// A conversion rate is a 0..1 fraction OR null. Null means the source stage had
// zero traffic, so there was nothing to convert FROM: that is genuinely unknown
// and reads as "no data", NEVER as 0%. A real 0 (traffic in, none through) is a
// true, alarming zero and reads as "0%". Confusing the two would send the owner
// optimizing a stage nobody has reached yet, so the two are kept distinct here.
const pctText = (rate) => (rate === null || rate === undefined ? "no data" : `${Math.round(rate * 1000) / 10}%`);

// Money reads as whole dollars with grouping: 493 -> "$493", 1000 -> "$1,000".
// One formatter so the bar, the headline, and the ledger never disagree.
const usd = (n) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

const COLS = [
  { k: "queued", label: "Queued" },
  { k: "filming", label: "Filming" },
  { k: "ready", label: "Premiered cuts" },
  { k: "dispatch_failed", label: "Dispatch failed" },
  { k: "human_review", label: "Human review" },
];

const mono9 = { fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--dim)" };
const when = (iso) => (iso ? String(iso).slice(0, 16).replace("T", " ") : "—");

function StatusDot({ status }) {
  const color = status === "live" ? "var(--green)" : status === "taken_down" ? "var(--red-lit)" : "var(--gold)";
  const label = status === "taken_down" ? "dark" : status;
  return (
    <span style={{ ...mono9, color: "var(--navy)", whiteSpace: "nowrap" }}>
      <i aria-hidden="true" style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, marginRight: 6 }} />
      {label}
    </span>
  );
}

// 30-day bars, no dependencies: the data is the decoration. `fmt`, when given,
// owns the whole tooltip value (e.g. money as "$99"); without it the bar keeps
// its original count-noun label ("2 views"), so every existing caller is
// unchanged.
function TrafficBars({ daily, color = "var(--navy)", unit = "view", fmt }) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  const label = (d) => (fmt ? `${d.date} · ${fmt(d.count)}` : `${d.date} · ${d.count} ${unit}${d.count === 1 ? "" : "s"}`);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 84, padding: "10px 2px 0" }}>
      {daily.map((d) => (
        <div key={d.date} title={label(d)}
          style={{ flex: 1, minWidth: 4, height: `${Math.max(3, Math.round((d.count / max) * 100))}%`,
            background: d.count ? color : "var(--line)", borderRadius: "2px 2px 0 0" }} />
      ))}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState({}); // per-tab payloads
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind, site }
  const [inspecting, setInspecting] = useState(null); // { site, report }

  const put = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const load = async (which = tab, force = false) => {
    if (data[which] && !force) return;
    setErr("");
    try {
      if (which === "overview") put("overview", await api.adminStats());
      if (which === "revenue") put("revenue", await api.adminStats());
      if (which === "films") put("films", await api.adminSites());
      if (which === "orders") {
        const results = await Promise.all(COLS.map((c) => api.adminOrders(c.k).then((r) => [c.k, r.orders]).catch(() => [c.k, []])));
        put("orders", Object.fromEntries(results));
      }
      if (which === "people") put("people", await api.adminUsers());
      if (which === "inbox") put("inbox", await api.adminContacts());
      if (which === "funnel") put("funnel", await api.adminFunnel());
      if (which === "controls") put("controls", await api.adminPipeline());
    } catch (e) { setErr(friendly(e.message)); }
  };
  useEffect(() => { load(tab); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- film moderation (existing owner-or-admin routes) ---------- */
  const act = async (fn, siteId) => {
    setBusy(siteId); setErr("");
    try { await fn(); await load("films", true); await load("overview", true); }
    catch (e) { setErr(friendly(e.message)); }
    finally { setBusy(null); setConfirm(null); }
  };
  const inspect = async (site) => {
    setBusy(site.siteId); setErr("");
    try { setInspecting({ site, report: await api.inspect(site.siteId) }); }
    catch (e) { setErr(friendly(e.message)); }
    finally { setBusy(null); }
  };

  const retry = async (orderId) => {
    setBusy(orderId); setErr("");
    try { await api.adminRetry(orderId); await load("orders", true); }
    catch (e) { setErr(friendly(e.message)); } finally { setBusy(null); }
  };

  const flipBreaker = async (enabled) => {
    setBusy("breaker"); setErr("");
    try { await api.adminPipelineSet(enabled); put("controls", await api.adminPipeline()); }
    catch (e) { setErr(friendly(e.message)); }
    finally { setBusy(null); setConfirm(null); }
  };

  const ov = data.overview;
  const rev = data.revenue?.revenue;
  const films = data.films;
  const board = data.orders;
  const people = data.people;
  const inbox = data.inbox;
  const funnel = data.funnel;
  const breaker = data.controls;

  // the funnel has ANY traffic only if some step recorded a count in 30 days.
  // With none, the desk shows its honest empty state instead of a row of zeros.
  const funnelHasData = !!funnel && funnel.steps.some((s) => s.total > 0);
  // the worst REAL drop-off: the lowest conversion among stages that actually
  // had traffic to convert (rate !== null). A null rate is unknown, not a drop,
  // so it can never be flagged as the worst step. This is the one row the owner
  // should act on tomorrow, so we find it once and flag exactly it.
  const worstConv = funnelHasData
    ? funnel.conversions
        .filter((c) => c.rate !== null && c.rate !== undefined)
        .sort((a, b) => a.rate - b.rate)[0] || null
    : null;
  // map worst drop to the "to" step it lands on, so the funnel row for that step
  // wears the flag (that is the stage losing people relative to the one above).
  const worstToStep = worstConv ? worstConv.to : null;
  const attention = ov ? (ov.orders.human_review || 0) + (ov.orders.dispatch_failed || 0) : 0;
  // an unclaimed purchase is money taken with nothing delivered: surface the
  // count on the tab from whichever payload we already loaded (revenue desk or
  // the overview card, since both carry the same revenue block).
  const unclaimed = (data.revenue?.revenue || ov?.revenue)?.unclaimed || 0;

  return (
    <>
      <div className="pagehead" data-scene="SCENE 03 · THE FLOOR">
        <SplitTitle text="Production" serif="floor" />
        <p className="sub">The whole studio on one desk: real platform data, every film, every order, and the master switch.</p>
      </div>

      {/* desk switcher */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line-2)", marginBottom: 26, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{ ...mono9, color: tab === t.k ? "var(--navy)" : "var(--dim)", background: "none", border: 0, cursor: "pointer",
              padding: "10px 14px", borderBottom: tab === t.k ? "2px solid var(--gold-g)" : "2px solid transparent", marginBottom: -1 }}>
            {t.label}
            {t.k === "orders" && attention > 0 && <b style={{ color: "var(--red-lit)", marginLeft: 6 }}>{attention}</b>}
            {t.k === "revenue" && unclaimed > 0 && <b style={{ color: "var(--red-lit)", marginLeft: 6 }}>{unclaimed}</b>}
          </button>
        ))}
        <button onClick={() => load(tab, true)} title="Refresh this desk"
          style={{ ...mono9, marginLeft: "auto", background: "none", border: 0, cursor: "pointer", padding: "10px 14px", color: "var(--dim)" }}>
          ↻ Refresh
        </button>
      </div>

      {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

      {/* ================= OVERVIEW ================= */}
      {tab === "overview" && (!ov ? <><Skeleton h={96} style={{ marginBottom: 14 }} /><Skeleton h={180} /></> : (
        <>
          <div className="metrics">
            <div className="metric"><b>{ov.users.total}</b><span>Studio accounts</span></div>
            <div className="metric"><b>{ov.films.live}<i style={{ fontStyle: "normal", color: "var(--faint)", fontSize: "60%" }}> / {ov.films.total}</i></b><span>Films live / total</span></div>
            <div className="metric"><b>{ov.traffic.views30}</b><span>Audience · 30 days</span></div>
          </div>
          <div className="metrics">
            <div className="metric"><b>{ov.orders.queued + ov.orders.filming}</b><span>Orders in motion</span></div>
            <div className="metric"><b style={{ color: attention ? "var(--red-lit)" : undefined }}>{attention}</b><span>Need attention</span></div>
            <div className="metric"><b>{ov.users.cutsSpent}</b><span>AI cuts spent</span></div>
          </div>
          {/* revenue on the overview: the chase is the headline number, and an
              unclaimed purchase turns the customers metric into a red alarm. */}
          <div className="metrics">
            <div className="metric"><b>{usd(ov.revenue?.totalUsd || 0)}<i style={{ fontStyle: "normal", color: "var(--faint)", fontSize: "48%" }}> / {usd(ov.revenue?.goal?.targetUsd || 1000)}</i></b><span>Revenue · toward goal</span></div>
            <div className="metric"><b>{usd(ov.revenue?.revenue30 || 0)}</b><span>Revenue · 30 days</span></div>
            <div className="metric"><b style={{ color: unclaimed ? "var(--red-lit)" : undefined }}>{ov.revenue?.payingCustomers || 0}{unclaimed > 0 && <i style={{ fontStyle: "normal", fontSize: "48%", color: "var(--red-lit)" }}> · {unclaimed} unclaimed</i>}</b><span>Paying customers</span></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 22, alignItems: "start" }}>
            <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={mono9}>The audience · last 30 days</div>
              <TrafficBars daily={ov.traffic.daily} />
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={{ ...mono9, marginBottom: 10 }}>Top screens</div>
              {ov.traffic.top.length === 0 && <div style={{ ...mono9, padding: "8px 0" }}>No views yet</div>}
              {ov.traffic.top.map((p) => (
                <div key={p.page} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 11 }}>
                  <span style={{ color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.page}</span>
                  <b style={{ color: "var(--gold)", paddingLeft: 10 }}>{p.count}</b>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, ...mono9 }}>
                <span>Waitlist {ov.waitlist}</span><span>Notes {ov.notes}</span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 22, alignItems: "start", marginTop: 22 }}>
            <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={mono9}>Accounts created · last 30 days</div>
              <TrafficBars daily={ov.signups?.daily || []} color="var(--gold-g)" unit="sign-up" />
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={mono9}>Premieres · last 30 days</div>
              <TrafficBars daily={ov.premieres?.daily || []} color="var(--green)" unit="premiere" />
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={mono9}>Orders placed · last 30 days</div>
              <TrafficBars daily={ov.ordersTrend?.daily || []} color="var(--red-2)" unit="order" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 22, alignItems: "start", marginTop: 22 }}>
            <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={{ ...mono9, marginBottom: 8 }}>Latest sign-ups</div>
              {(ov.recent?.users || []).length === 0 && <div style={{ ...mono9, padding: "8px 0" }}>Nobody yet</div>}
              {(ov.recent?.users || []).map((u, i) => (
                <div key={u.email || i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderTop: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 11 }}>
                  <span style={{ color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email || "—"}</span>
                  <span style={{ color: "var(--dim)", whiteSpace: "nowrap" }}>{when(u.at).slice(0, 10)}</span>
                </div>
              ))}
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={{ ...mono9, marginBottom: 8 }}>Latest films</div>
              {(ov.recent?.films || []).length === 0 && <div style={{ ...mono9, padding: "8px 0" }}>No films yet</div>}
              {(ov.recent?.films || []).map((f) => (
                <div key={f.slug} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderTop: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 11 }}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.slug}</a>
                  <span style={{ color: f.status === "live" ? "var(--green-lit)" : "var(--dim)", whiteSpace: "nowrap" }}>{f.status === "taken_down" ? "dark" : f.status}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ))}

      {/* ================= REVENUE ================= */}
      {/* The chase: 1000 USD in 30 days. Lead with an honest progress bar, then
          the headline money, the daily bars, and every real purchase. Zero
          revenue reads as a true zero, never a blank or an invented number. */}
      {tab === "revenue" && (!rev ? (
        <>
          <Skeleton h={112} style={{ marginBottom: 22 }} />
          <div className="metrics" style={{ marginBottom: 22 }}><Skeleton h={92} /><Skeleton h={92} /><Skeleton h={92} /></div>
          <Skeleton h={132} style={{ marginBottom: 22 }} />
          <Skeleton h={220} />
        </>
      ) : (
        <>
          {/* unclaimed = money taken, credits never delivered: a customer-facing
              emergency, so it shouts above everything else on the desk. */}
          {rev.unclaimed > 0 && (
            <div style={{ border: "1.5px solid var(--red-lit)", background: "rgba(200, 16, 46, .07)", borderRadius: 14, padding: "16px 18px", marginBottom: 22, display: "flex", alignItems: "flex-start", gap: 12 }}>
              <i aria-hidden="true" className="recdot" style={{ marginTop: 6 }} />
              <div>
                <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 17, color: "var(--red-lit)", textTransform: "uppercase", letterSpacing: ".01em" }}>
                  {rev.unclaimed} unclaimed purchase{rev.unclaimed === 1 ? "" : "s"}
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--navy)", margin: "6px 0 0" }}>
                  Someone paid and their credits never landed on an account. Find them in the ledger below, match the email to a studio account, and grant the credits by hand. Never leave a paying customer empty-handed.
                </p>
              </div>
            </div>
          )}

          {/* progress toward the goal: the bar is honest. A true zero reads as
              an empty track with the real numbers spelled out beneath it. */}
          <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "18px 20px", marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <div style={mono9}>The chase · 1000 USD in 30 days</div>
              <div style={{ ...mono9, color: "var(--navy)" }}>{rev.goal.pct}% there</div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
              <b style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(1.8rem, 5vw, 2.8rem)", lineHeight: 1, color: "var(--navy)" }}>{usd(rev.goal.amountUsd)}</b>
              <span style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "1.1rem", color: "var(--faint)" }}>/ {usd(rev.goal.targetUsd)}</span>
            </div>
            <div style={{ height: 14, borderRadius: 99, background: "var(--line)", overflow: "hidden", position: "relative" }}>
              <div style={{ height: "100%", width: `${rev.goal.pct}%`, background: rev.goal.pct >= 100 ? "var(--green)" : "var(--gold-g)", borderRadius: 99, transition: "width .5s cubic-bezier(.22,1,.36,1)" }} />
            </div>
            <div style={{ ...mono9, marginTop: 10 }}>
              {rev.goal.amountUsd === 0
                ? "No revenue yet. The register is armed and every real sale lands here the moment it clears."
                : rev.goal.pct >= 100
                  ? "Goal cleared. The chase is won. Every dollar past this is upside."
                  : `${usd(Math.max(0, rev.goal.targetUsd - rev.goal.amountUsd))} to go`}
            </div>
          </div>

          {/* headline money: total (real only), 30-day, paying customers */}
          <div className="metrics" style={{ marginBottom: 22 }}>
            <div className="metric"><b>{usd(rev.totalUsd)}</b><span>Total revenue · real money</span></div>
            <div className="metric"><b>{usd(rev.revenue30)}</b><span>Revenue · last 30 days</span></div>
            <div className="metric"><b>{rev.payingCustomers}</b><span>Paying customers</span></div>
          </div>

          {/* the test-mode line: a provider's validation charge is visible and
              obviously not real money, so nobody mistakes a test for a sale. */}
          <div style={{ ...mono9, marginBottom: 22, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: rev.testCount ? "var(--gold-g)" : "var(--line)" }} />
            {rev.testCount > 0
              ? `${rev.testCount} test-mode purchase${rev.testCount === 1 ? "" : "s"} on the books · provider validation, not real money, excluded from every total above`
              : "No test-mode purchases · nothing to exclude from the totals"}
          </div>

          {/* 30-day revenue bars: same dependency-free component as the audience
              chart, with money in the tooltip instead of a count. */}
          <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px", marginBottom: 22 }}>
            <div style={mono9}>Revenue · last 30 days</div>
            <TrafficBars daily={rev.daily} color="var(--green)" fmt={usd} />
          </div>

          {/* the ledger: every recent real purchase, unclaimed ones flagged loud */}
          <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", overflow: "hidden" }}>
            <div style={{ ...mono9, padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
              <span>Recent purchases</span><b style={{ color: "var(--navy)" }}>{rev.payingCustomers}</b>
            </div>
            {rev.recent.length === 0 && <div style={{ ...mono9, padding: 22 }}>No sales yet. When the first one clears, it lands here.</div>}
            {rev.recent.map((p, i) => (
              <div key={p.id || i} style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "baseline", padding: "13px 18px", borderTop: "1px solid var(--line)", background: p.claimed ? undefined : "rgba(200, 16, 46, .05)" }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 15, color: "var(--navy)" }}>{p.product || "Purchase"}</span>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.email || "no email on record"}{p.id ? ` · ${p.id}` : ""}
                  </div>
                </div>
                <b style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 16, color: "var(--green-lit)" }}>{usd(p.amountUsd)}</b>
                {p.claimed
                  ? <span style={{ ...mono9, color: "var(--green-lit)" }}><i aria-hidden="true" style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--green)", marginRight: 6 }} />claimed</span>
                  : <span style={{ ...mono9, color: "var(--red-lit)" }}><i aria-hidden="true" className="recdot" style={{ margin: "0 6px 0 0" }} />unclaimed</span>}
                <span style={mono9}>{when(p.at)}</span>
              </div>
            ))}
          </div>
        </>
      ))}

      {/* ================= FILMS ================= */}
      {tab === "films" && (!films ? <Skeleton h={300} /> : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", overflow: "hidden" }}>
          <div style={{ ...mono9, padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
            <span>Every film on the platform</span><b style={{ color: "var(--navy)" }}>{films.total}</b>
          </div>
          {films.sites.length === 0 && <div style={{ ...mono9, padding: 22 }}>No films yet</div>}
          {films.sites.map((s) => (
            <div key={s.siteId} style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "center", padding: "13px 18px", borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: "1 1 250px", minWidth: 0 }}>
                <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 15, color: "var(--navy)" }}>{s.title || s.slug}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.ownerEmail || s.owner || "unknown owner"}{s.orderId ? " · AI cut" : ""}{s.audienceOf ? " · audience version" : ""}
                </div>
                <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                  style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: "100%" }}>
                  {s.url}
                </a>
              </div>
              <StatusDot status={s.status} />
              <span style={{ ...mono9, color: s.views30 ? "var(--navy)" : undefined }}>{s.views30} view{s.views30 === 1 ? "" : "s"} · 30d</span>
              <span style={{ ...mono9, color: "var(--navy)" }}>R{s.releases}{s.liveRelease ? ` · live ${s.liveRelease}` : ""}{s.stagedRelease ? ` · staged ${s.stagedRelease}` : ""}</span>
              <span style={mono9}>{when(s.publishedAt || s.createdAt)}</span>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                {s.status === "live" && <a className="btn ghost" style={{ padding: "5px 10px", fontSize: 9 }} href={s.url} target="_blank" rel="noopener noreferrer">Watch</a>}
                <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 9 }} disabled={busy === s.siteId} onClick={() => inspect(s)}>Inspect</button>
                {s.status === "live" && (
                  <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 9, color: "var(--red-lit)" }} onClick={() => setConfirm({ kind: "takedown", site: s })}>Take down</button>
                )}
                {s.status === "taken_down" && (<>
                  <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 9 }} disabled={busy === s.siteId} onClick={() => act(() => api.rollback(s.siteId), s.siteId)}>Relight</button>
                  <button className="btn danger" style={{ padding: "5px 10px", fontSize: 9 }} onClick={() => setConfirm({ kind: "delete", site: s })}>Delete</button>
                </>)}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* ================= ORDERS (the original kanban) ================= */}
      {tab === "orders" && (!board ? <div className="kanban"><Skeleton h={160} /><Skeleton h={160} /><Skeleton h={160} /><Skeleton h={160} /><Skeleton h={160} /></div> : (
        <div className="kanban">
          {COLS.map((c) => (
            <div key={c.k} className="kcol">
              <h4>{c.label} <b>{board[c.k]?.length || 0}</b></h4>
              {(board[c.k] || []).map((o) => (
                <div key={o.orderId} className="kcard">
                  <div className="who">{o.name || o.email}</div>
                  <div className="meta2">{o.orderId.slice(0, 8)} · {o.role} · {(o.createdAt || "").slice(5, 16).replace("T", " ")}</div>
                  {["queued", "filming", "dispatch_failed", "human_review"].includes(o.status) && (
                    <div className="acts">
                      <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 9 }} disabled={busy === o.orderId} onClick={() => retry(o.orderId)}>
                        {busy === o.orderId ? "…" : "Retry"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {(board[c.k] || []).length === 0 && <div className="mono" style={{ padding: 14, fontSize: 8.5 }}>CLEAR</div>}
            </div>
          ))}
        </div>
      ))}

      {/* ================= PEOPLE ================= */}
      {tab === "people" && (!people ? <Skeleton h={260} /> : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", overflow: "hidden" }}>
          <div style={{ ...mono9, padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
            <span>Everyone in the studio</span><b style={{ color: "var(--navy)" }}>{people.total}</b>
          </div>
          {people.users.map((u) => (
            <div key={u.sub} style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "baseline", padding: "12px 18px", borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--navy)" }}>{u.email || u.sub}</span>
                {u.name && <span style={{ ...mono9, marginLeft: 10 }}>{u.name}</span>}
              </div>
              <span style={{ ...mono9, color: u.plan === "free" ? "var(--dim)" : "var(--gold)" }}>{u.plan}</span>
              <span style={{ ...mono9, color: u.aiCuts >= 3 ? "var(--red-lit)" : "var(--navy)" }}>cuts {u.aiCuts}/3</span>
              <span style={mono9}>joined {when(u.createdAt)}</span>
            </div>
          ))}
        </div>
      ))}

      {/* ================= INBOX ================= */}
      {tab === "inbox" && (!inbox ? <Skeleton h={220} /> : (
        <div style={{ display: "grid", gap: 14 }}>
          {inbox.notes.length === 0 && <div style={{ ...mono9, padding: 10 }}>The inbox is quiet.</div>}
          {inbox.notes.map((n) => (
            <div key={n.id} style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--navy)" }}><b>{n.name || "Visitor"}</b> · {n.email}</span>
                <span style={mono9}>{when(n.at)}</span>
              </div>
              <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, color: "var(--navy)", borderLeft: "3px solid var(--red)", paddingLeft: 12, margin: "0 0 12px" }}>{n.message}</p>
              <a className="btn ghost" style={{ padding: "6px 12px", fontSize: 9 }} href={`mailto:${n.email}?subject=${encodeURIComponent("Re: your note to CineFolio Studios")}`}>Reply</a>
            </div>
          ))}
        </div>
      ))}

      {/* ================= FUNNEL ================= */}
      {/* One question, answered at a glance: where are we losing people. Nine
          stages top to bottom, each with its 30-day total and the conversion
          from the stage above. The worst REAL drop is flagged so the owner
          knows the single stage to fix tomorrow. A null rate reads "no data",
          never 0%, because an empty top-of-funnel is not a catastrophic drop. */}
      {tab === "funnel" && (!funnel ? (
        <>
          <Skeleton h={112} style={{ marginBottom: 22 }} />
          <Skeleton h={132} style={{ marginBottom: 22 }} />
          <Skeleton h={132} style={{ marginBottom: 22 }} />
          <Skeleton h={200} />
        </>
      ) : !funnelHasData ? (
        // honest empty state: no invented numbers, just what the funnel is and
        // how it fills. Nothing has moved through the product in this window yet.
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "26px 28px" }}>
          <div style={{ ...mono9, marginBottom: 10 }}>Conversion funnel · last 30 days</div>
          <b style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 20, color: "var(--navy)", textTransform: "uppercase", letterSpacing: ".01em", display: "block", marginBottom: 8 }}>
            No funnel data yet
          </b>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--dim)", maxWidth: "62ch", margin: 0 }}>
            The funnel fills as visitors move through the product: a landing view, a sign-up started, an account confirmed, a portfolio saved, an AI cut, a published film, a pricing view, a checkout click, and finally a purchase. Nobody has crossed any of these steps in the last 30 days, so there is nothing to chart. The moment real traffic lands, each stage and the drop-off between stages appears here, no placeholder numbers.
          </p>
        </div>
      ) : (
        <>
          {/* the answer, up top: the single worst real drop-off, named, so the
              owner reads the action before the chart. Purely from real rates. */}
          {worstConv && (
            <div style={{ border: "1.5px solid var(--red-lit)", background: "rgba(200, 16, 46, .07)", borderRadius: 14, padding: "16px 18px", marginBottom: 22, display: "flex", alignItems: "flex-start", gap: 12 }}>
              <i aria-hidden="true" className="recdot" style={{ marginTop: 6 }} />
              <div>
                <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 17, color: "var(--red-lit)", textTransform: "uppercase", letterSpacing: ".01em" }}>
                  Biggest drop-off · {FUNNEL_LABELS[worstConv.from]?.label || worstConv.from} → {FUNNEL_LABELS[worstConv.to]?.label || worstConv.to}
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--navy)", margin: "6px 0 0" }}>
                  Only {pctText(worstConv.rate)} of the {worstConv.fromCount.toLocaleString("en-US")} who reached {FUNNEL_LABELS[worstConv.from]?.label?.toLowerCase() || worstConv.from} carried on to {FUNNEL_LABELS[worstConv.to]?.label?.toLowerCase() || worstConv.to} ({worstConv.toCount.toLocaleString("en-US")}). This is the leakiest stage in the funnel and the one to fix first.
                </p>
              </div>
            </div>
          )}

          {/* the vertical funnel: nine stages top to bottom. Each row is the
              stage label + meaning, its 30-day total, a width-proportional bar,
              and the conversion FROM the stage above (the top stage has none).
              The worst real drop wears a red flag; a null rate reads "no data". */}
          {(() => {
            // bar width is a stage's total relative to the widest stage (the top
            // of funnel), guarded so an all-nonzero-but-tiny funnel still draws.
            const maxTotal = Math.max(1, ...funnel.steps.map((s) => s.total));
            // conversion INTO each step, keyed by the "to" step, so a row can
            // show the rate from the stage directly above it. Index 0 has none.
            const convTo = Object.fromEntries(funnel.conversions.map((c) => [c.to, c]));
            return (
              <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", overflow: "hidden", marginBottom: 22 }}>
                <div style={{ ...mono9, padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
                  <span>Conversion funnel · last 30 days</span><span>where people drop</span>
                </div>
                {funnel.steps.map((s, i) => {
                  const meta = FUNNEL_LABELS[s.step] || { label: s.step, note: "" };
                  const conv = convTo[s.step]; // the step above -> this step
                  const isWorst = s.step === worstToStep;
                  const width = Math.max(2, Math.round((s.total / maxTotal) * 100));
                  return (
                    <div key={s.step} style={{ padding: "13px 18px", borderTop: i === 0 ? 0 : "1px solid var(--line)", background: isWorst ? "rgba(200, 16, 46, .05)" : undefined }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "baseline", marginBottom: 8 }}>
                        <span style={{ ...mono9, color: "var(--gold)", width: 22 }}>{String(i + 1).padStart(2, "0")}</span>
                        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                          <span style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 15, color: "var(--navy)" }}>{meta.label}</span>
                          {isWorst && <span style={{ ...mono9, color: "var(--red-lit)", marginLeft: 10 }}><i aria-hidden="true" className="recdot" style={{ margin: "0 5px 0 0" }} />biggest drop</span>}
                          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--dim)" }}>{meta.note}</div>
                        </div>
                        {/* conversion FROM the stage above: the top stage has no
                            prior stage, so it reads "top of funnel", never a rate.
                            A null rate reads "no data" (unknown), never "0%". */}
                        {i === 0
                          ? <span style={{ ...mono9 }}>top of funnel</span>
                          : conv?.rate === null || conv?.rate === undefined
                            ? <span style={{ ...mono9 }} title="The stage above had no traffic, so there is nothing to convert from. This is unknown, not a real 0%.">no data from prior step</span>
                            : <span style={{ ...mono9, color: isWorst ? "var(--red-lit)" : "var(--navy)" }}>{pctText(conv.rate)} from prior step</span>}
                        <b style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 16, color: "var(--navy)", minWidth: 54, textAlign: "right" }}>{s.total.toLocaleString("en-US")}</b>
                      </div>
                      {/* width-proportional bar: the stage's 30-day total against
                          the widest stage. Real zero draws the faint track only. */}
                      <div style={{ height: 12, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${width}%`, background: s.total === 0 ? "var(--line)" : isWorst ? "var(--red-2)" : "var(--gold-g)", borderRadius: 99, transition: "width .5s cubic-bezier(.22,1,.36,1)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* daily trend for the headline stages, reusing the dependency-free
              bars: the top of funnel (visitors), the account milestone, and the
              money step, so the owner sees WHEN as well as WHERE. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 22, alignItems: "start" }}>
            {[
              { step: "landing_view", color: "var(--navy)", unit: "view" },
              { step: "signup_complete", color: "var(--gold-g)", unit: "sign-up" },
              { step: "purchase", color: "var(--green)", unit: "purchase" },
            ].map(({ step, color, unit }) => {
              const s = funnel.steps.find((x) => x.step === step);
              const meta = FUNNEL_LABELS[step];
              return (
                <div key={step} style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "16px 18px" }}>
                  <div style={{ ...mono9, display: "flex", justifyContent: "space-between" }}>
                    <span>{meta.label} · last 30 days</span><b style={{ color: "var(--navy)" }}>{(s?.total || 0).toLocaleString("en-US")}</b>
                  </div>
                  <TrafficBars daily={s?.daily || []} color={color} unit={unit} />
                </div>
              );
            })}
          </div>
        </>
      ))}

      {/* ================= CONTROLS ================= */}
      {tab === "controls" && (!breaker ? <Skeleton h={160} /> : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", padding: "22px 24px", maxWidth: 560 }}>
          <div style={{ ...mono9, marginBottom: 14 }}>Order pipeline · circuit breaker</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: "50%", background: breaker.enabled ? "var(--green)" : "var(--red-lit)", boxShadow: breaker.enabled ? "0 0 10px rgba(14,158,98,.5)" : "0 0 10px rgba(176,14,40,.5)" }} />
            <b style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, color: "var(--navy)", textTransform: "uppercase" }}>
              {breaker.enabled ? "Cameras rolling" : "Cut. Floor stopped"}
            </b>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--dim)", marginBottom: 16 }}>
            {breaker.enabled
              ? "New orders dispatch to the AI director normally. Stopping the floor makes the pipeline's Validate step refuse every dispatch: queued orders drain to human review instead of filming, nothing is lost."
              : "The breaker is open: nothing dispatches. Orders keep queuing and drain to human review. Roll the cameras to resume, then retry stuck orders from the Orders desk."}
          </p>
          <button className={`btn ${breaker.enabled ? "danger" : "primary"}`} disabled={busy === "breaker"}
            onClick={() => (breaker.enabled ? setConfirm({ kind: "cut" }) : flipBreaker(true))}>
            {busy === "breaker" ? <span className="spin" /> : null}
            {breaker.enabled ? "Cut: stop the floor" : "Roll cameras: resume the floor"}
          </button>
          <p style={{ ...mono9, marginTop: 14 }}>New workers obey immediately · warm workers as they recycle</p>
        </div>
      ))}

      {/* ---------- confirmations ---------- */}
      <ConfirmDialog
        open={confirm?.kind === "takedown"}
        kicker="Moderation" title={`Take down ${confirm?.site?.slug}?`}
        body={`The film goes dark everywhere a viewer could reach it. Releases stay archived; the owner (${confirm?.site?.ownerEmail || "unknown"}) can relight or you can, from here.`}
        confirmLabel="Take it down" danger busy={busy === confirm?.site?.siteId}
        onConfirm={() => act(() => api.takedown(confirm.site.siteId), confirm.site.siteId)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "delete"}
        kicker="Moderation" title={`Delete ${confirm?.site?.slug} forever?`}
        body="Every release, row, and the slug claim burns. This is the real delete; there is no relight after this."
        confirmLabel="Delete forever" danger busy={busy === confirm?.site?.siteId}
        onConfirm={() => act(() => api.deleteSite(confirm.site.siteId), confirm.site.siteId)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "cut"}
        kicker="Master switch" title="Stop the production floor?"
        body="Every new dispatch is refused until you roll again. Orders keep queuing and drain to human review; clients are emailed the honest delay note by the pipeline."
        confirmLabel="Cut" danger busy={busy === "breaker"}
        onConfirm={() => flipBreaker(false)}
        onClose={() => setConfirm(null)}
      />

      {/* ---------- release inspector ---------- */}
      <Dialog open={!!inspecting} title={`Release truth · ${inspecting?.site?.slug || ""}`} kicker="Inspector" onClose={() => setInspecting(null)} width={560}>
        {inspecting?.report?.releases?.map((r) => (
          <div key={r.n} style={{ borderTop: "1px solid var(--line)", padding: "10px 0", fontFamily: "var(--mono)", fontSize: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--navy)" }}>
              <b>Release {r.n}{inspecting.report.liveRelease === r.n ? " · LIVE" : ""}</b>
              <span style={{ color: "var(--dim)" }}>{r.source || "direct"}</span>
            </div>
            {r.listError
              ? <div style={{ color: "var(--red-lit)", marginTop: 4 }}>{r.listError}</div>
              : <div style={{ color: "var(--dim)", marginTop: 4 }}>
                  manifest {r.manifest.length} · in S3 {r.inS3?.length ?? "?"}
                  {r.missing?.length > 0 && <span style={{ color: "var(--red-lit)" }}> · missing {r.missing.join(", ")}</span>}
                  {r.extra?.length > 0 && <span style={{ color: "var(--gold)" }}> · extra {r.extra.length}</span>}
                </div>}
          </div>
        ))}
        {inspecting?.report?.orderAssets && (
          <div style={{ ...mono9, marginTop: 10 }}>
            Born from order {String(inspecting.report.orderAssets.orderId).slice(0, 8)} · {inspecting.report.orderAssets.uploadedAssets.length} uploaded assets
          </div>
        )}
      </Dialog>
    </>
  );
}
