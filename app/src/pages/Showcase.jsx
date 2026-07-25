// Showcase: the public proof wall. Real, delivered customer portfolios that
// their owners opted into showing, each card a live preview that links to the
// real site. This is a conversion asset first (a cold buyer wants proof; a
// payment-provider reviewer asks to see real delivered product) and an SEO page
// second: semantic sections, one real heading hierarchy, descriptive alt text.
//
// It MUST work for a logged-out visitor, so it reads the PUBLIC /showcase
// endpoint directly (no auth token, no console shell). It renders ONLY what the
// API returns: an honest empty state shows a call to action, never a fabricated
// portfolio, and no customer name or slug is ever baked into this file. Built on
// the light-canvas design system in styles.css (the .bk* backlot classes are
// scoped to the dark authenticated shell and would not apply out here).
//
// LIVE PREVIEW DECISION (no new dependency, no build step):
// Each card shows the ACTUAL portfolio. If the record carries a poster image we
// use that (cheapest, most reliable). Otherwise we render the live site itself
// in a small, non-interactive iframe styled as a poster (the design system's
// .poster monitor scales it down and disables pointer events). A gallery of
// text links is weak proof; a wall of living portfolios is strong proof.
// A full-site iframe is not free, though, so we are disciplined about it:
//   - only a small EAGER_LIMIT of cards mount their preview up front,
//   - every other card mounts its iframe only once it scrolls near the viewport
//     (IntersectionObserver), so an off-screen card costs nothing, which keeps
//     the page light on a phone,
//   - native loading="lazy" is kept as a second layer of defense,
//   - the real, clickable link is the whole card, on top of the poster, so a
//     click always goes to the real site in a new tab.
// If IntersectionObserver is unavailable we fall back to native lazy iframes.
import { useEffect, useRef, useState } from "react";
import { CONFIG } from "../config.js";

// how many previews may hydrate immediately (above the fold on most screens);
// the rest wait until they are scrolled near. A handful, never the whole grid.
const EAGER_LIMIT = 4;

// microstates as a tiny state machine: "loading" -> "ready" | "error"
export default function Showcase({ onEnter }) {
  const [state, setState] = useState("loading");
  const [films, setFilms] = useState([]);

  useEffect(() => {
    let alive = true;
    // the public endpoint takes no auth; a plain fetch keeps this page usable by
    // a logged-out stranger with no session at all.
    fetch(`${CONFIG.apiBase}/showcase`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Request failed (${r.status})`))))
      .then((data) => {
        if (!alive) return;
        setFilms(Array.isArray(data.films) ? data.films : []);
        setState("ready");
      })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, []);

  // the primary call to action: build your own. On the marketing site an onEnter
  // handler routes into the console; as a plain link it still works anywhere.
  const buildCta = (label = "Build your own portfolio", className = "btn primary") =>
    (onEnter
      ? <button type="button" className={className} onClick={onEnter}>{label}</button>
      : <a className={className} href="/">{label}</a>);

  return (
    <main className="page">
      <header className="pagehead" data-scene="THE SHOWCASE">
        <h1>Real portfolios, <em>really delivered.</em></h1>
        <p className="sub">
          Every portfolio below was built by a real person using CineFolio and published to its own
          address. Nothing here is a mockup, a template screenshot, or stock: each card is a live
          preview of the real site, shown with its owner&apos;s permission. Open any one and you land
          on the finished product.
        </p>
        <div className="btnrow">
          {buildCta("Build your own portfolio", "btn marquee")}
          <a className="btn ghost" href="#films">See the portfolios</a>
        </div>
      </header>

      {/* trust strip: the three facts a payment reviewer and a cold buyer both
          want confirmed, stated plainly. Rendered for everyone, no data needed. */}
      <TrustStrip count={state === "ready" ? films.length : null} />

      <section id="films" aria-labelledby="films-heading">
        <h2 id="films-heading" className="scene-hd">Live customer portfolios</h2>

        {state === "loading" && <ShowcaseSkeletons />}

        {state === "error" && (
          <div className="panel" role="alert" style={{ borderColor: "rgba(200, 16, 46, .4)" }}>
            <span className="mono" style={{ color: "var(--red-lit)" }}>THE REEL SNAGGED</span>
            <p style={{ marginTop: 10, color: "var(--dim)" }}>
              We could not load the showcase just now. Give it a moment and refresh; if it keeps
              happening, the crew is already alarmed about it.
            </p>
            <div className="btnrow">
              <button type="button" className="btn ghost" onClick={() => location.reload()}>Try again</button>
            </div>
          </div>
        )}

        {/* honest empty state: never a fabricated entry, always a way forward. It
            still sells: it explains WHY it is empty (consent is off by default)
            and turns that into a reason to trust the product. */}
        {state === "ready" && films.length === 0 && (
          <div className="panel" style={{ textAlign: "center", padding: "48px 26px" }}>
            <span className="mono" style={{ color: "var(--gold)" }}>THE MARQUEE IS DARK, FOR NOW</span>
            <p style={{ margin: "12px auto 0", maxWidth: "52ch", color: "var(--dim)" }}>
              No portfolios are on public display yet. Every site here is opt-in, and we only show one
              once its owner says yes, so an empty wall means we are still waiting on permission, never
              that the product has nothing to show. Want yours to be the first? Build a portfolio and
              premiere it in minutes.
            </p>
            <div className="btnrow" style={{ justifyContent: "center" }}>
              {buildCta()}
            </div>
          </div>
        )}

        {state === "ready" && films.length > 0 && (
          <>
            <ul
              className="grid"
              style={{ listStyle: "none", padding: 0, margin: 0, gridTemplateColumns: "repeat(auto-fill, minmax(clamp(260px, 44vw, 320px), 1fr))" }}
            >
              {films.map((f, i) => <FilmCard key={f.slug} film={f} eager={i < EAGER_LIMIT} />)}
            </ul>

            {/* closing call to action, once a visitor has seen the proof */}
            <aside className="premiere" style={{ marginTop: 40, textAlign: "center" }} aria-label="Build your own">
              <p className="mq">Your career, <em>in cinema.</em></p>
              <p style={{ margin: "10px auto 0", maxWidth: "52ch", color: "var(--dim)" }}>
                Each of these started as an ordinary resume. Yours can premiere to its own address
                today, on the same platform that shipped every portfolio above.
              </p>
              <div className="btnrow" style={{ justifyContent: "center" }}>
                {buildCta()}
              </div>
            </aside>
          </>
        )}
      </section>
    </main>
  );
}

// the three trust facts, in the design system's mono + panel language. `count`
// is shown only once it is known and non-zero, so the strip never claims a
// number the wall cannot back up.
function TrustStrip({ count }) {
  const facts = [
    ["REAL PEOPLE", "Built by actual customers, not us. Every portfolio is someone's own work."],
    ["THEIR OWN ADDRESS", "Each one is published live on its own subdomain. The link goes to the real site."],
    ["SHOWN BY CONSENT", "Opt-in only. Owners choose to appear here and can withdraw at any time."],
  ];
  return (
    <section aria-label="What you are looking at" style={{ margin: "0 0 30px" }}>
      <ul
        className="grid"
        style={{ listStyle: "none", padding: 0, margin: 0, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}
      >
        {facts.map(([k, v]) => (
          <li key={k} className="panel" style={{ padding: "16px 18px" }}>
            <span className="mono" style={{ color: "var(--gold)" }}>{k}</span>
            <p style={{ margin: "8px 0 0", color: "var(--dim)", fontSize: 14 }}>{v}</p>
          </li>
        ))}
      </ul>
      {typeof count === "number" && count > 0 && (
        <p className="mono" style={{ marginTop: 12, color: "var(--dim)" }}>
          {count} live portfolio{count === 1 ? "" : "s"} on display
        </p>
      )}
    </section>
  );
}

// one card = one real, live portfolio. The whole card is a link to the live
// site. A record with a poster shows it (cheap, reliable); without one, the live
// site is rendered as a self-portrait poster in a dark screen, mounted only when
// the card is eager or has scrolled near the viewport. The role label (film.kind,
// e.g. "Engineer", "Founder"), when the API provides it, tells a cold visitor
// what KIND of professional this portfolio belongs to; we never invent one.
function FilmCard({ film, eager }) {
  const title = film.title || film.slug;
  const host = hostOf(film.url);
  const kind = typeof film.kind === "string" && film.kind.trim() ? film.kind.trim() : null;
  const visible = useNearViewport(eager);

  return (
    <li>
      <a
        className="sitecard"
        href={film.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={
          kind
            ? `Open the live ${kind} portfolio for ${title} at ${host} in a new tab`
            : `Open the live portfolio for ${title} at ${host} in a new tab`
        }
      >
        <div className="poster" ref={visible.ref}>
          {film.poster ? (
            <img
              src={film.poster}
              alt={`Portfolio poster for ${title}`}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : visible.show ? (
            <iframe
              title={`Live portfolio preview for ${title}`}
              src={film.url}
              sandbox="allow-scripts"
              loading="lazy"
              scrolling="no"
              tabIndex={-1}
              referrerPolicy="no-referrer"
              aria-hidden="true"
            />
          ) : (
            // lightweight placeholder before the preview mounts: on-brand, no
            // network cost, and honest (it names the real live address).
            <PosterPlaceholder host={host} />
          )}
          <span className="veil" aria-hidden="true" />
        </div>

        {kind && (
          <span className="mono" style={{ color: "var(--gold)", marginBottom: -2 }}>{kind}</span>
        )}
        <div className="row1">
          <h3 className="cardtitle">{title}</h3>
          <span className="badge live">Live</span>
        </div>
        <span className="mono" style={{ textTransform: "none", letterSpacing: ".04em" }}>
          {host}
        </span>
      </a>
    </li>
  );
}

// the pre-hydration poster: the design system's dark screen with the live
// address and a small "live preview" hint. Costs nothing to render.
function PosterPlaceholder({ host }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 6, padding: 16, textAlign: "center",
      }}
    >
      <span className="mono" style={{ color: "var(--screen-dim)" }}>LIVE PREVIEW</span>
      <span className="mono" style={{ color: "var(--screen-dim)", textTransform: "none", letterSpacing: ".04em", fontSize: 11 }}>
        {host}
      </span>
    </span>
  );
}

// mount the heavy preview only when the card is eager (top of the grid) or has
// scrolled near the viewport. Returns a ref to attach and whether to show the
// preview. Degrades to "always show" where IntersectionObserver is missing.
function useNearViewport(eager) {
  const ref = useRef(null);
  const [show, setShow] = useState(!!eager);

  useEffect(() => {
    if (show) return; // already mounting (eager, or previously intersected)
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShow(true); // no observer support -> fall back to native lazy iframe
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      // start loading a little before the card is fully on screen so the preview
      // is ready by the time the visitor reaches it
      { rootMargin: "300px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  return { ref, show };
}

// the human-readable address for the caption, e.g. someones-name.cinefolio.dev
function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

// skeletons that match the card shape: a poster block (16/10) plus a title row,
// so the layout does not jump when the real portfolios arrive.
function ShowcaseSkeletons() {
  return (
    <div className="grid" aria-hidden="true" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(clamp(260px, 44vw, 320px), 1fr))" }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="sitecard">
          <div className="skel" style={{ aspectRatio: "16 / 10", borderRadius: 10, marginBottom: 8 }} />
          <div className="row1">
            <div className="skel" style={{ height: 18, width: "58%" }} />
            <div className="skel" style={{ height: 14, width: 44 }} />
          </div>
          <div className="skel" style={{ height: 12, width: "72%", marginTop: 4 }} />
        </div>
      ))}
    </div>
  );
}
