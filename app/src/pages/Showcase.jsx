// Showcase: the public proof wall. Real, delivered customer portfolios that
// their owners opted into showing, each card a link to the live site. This is a
// conversion asset first (buyers want proof; payment-provider reviewers ask to
// see real delivered product) and an SEO page second: semantic sections, one
// real heading hierarchy, descriptive alt text.
//
// It MUST work for a logged-out visitor, so it reads the PUBLIC /showcase
// endpoint directly (no auth token, no console shell). It renders ONLY what the
// API returns: an honest empty state shows a call to action, never a fabricated
// portfolio. Built on the light-canvas design system in styles.css (the .bk*
// backlot classes are scoped to the dark authenticated shell and would not
// apply out here).
import { useEffect, useState } from "react";
import { CONFIG } from "../config.js";

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
          Every film below is a live portfolio we built and shipped for a real person, published to
          its own address and shown here with its owner&apos;s permission. No mockups, no stock,
          no placeholders. Open any one and see the finished product.
        </p>
        <div className="btnrow">
          {buildCta("Build your own portfolio", "btn marquee")}
          <a className="btn ghost" href="#films">See the films</a>
        </div>
      </header>

      <section id="films" aria-labelledby="films-heading">
        <h2 id="films-heading" className="scene-hd">Delivered portfolios</h2>

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

        {/* honest empty state: never a fabricated entry, always a way forward */}
        {state === "ready" && films.length === 0 && (
          <div className="panel" style={{ textAlign: "center", padding: "48px 26px" }}>
            <span className="mono" style={{ color: "var(--gold)" }}>THE MARQUEE IS DARK, FOR NOW</span>
            <p style={{ margin: "12px auto 0", maxWidth: "48ch", color: "var(--dim)" }}>
              No portfolios are on public display yet. The first ones are on their way. Want yours to
              be among them? Build a film and premiere it in minutes.
            </p>
            <div className="btnrow" style={{ justifyContent: "center" }}>
              {buildCta()}
            </div>
          </div>
        )}

        {state === "ready" && films.length > 0 && (
          <>
            <ul className="grid" style={{ listStyle: "none", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {films.map((f) => <FilmCard key={f.slug} film={f} />)}
            </ul>

            {/* closing call to action, once a visitor has seen the proof */}
            <aside className="premiere" style={{ marginTop: 40, textAlign: "center" }} aria-label="Build your own">
              <p className="mq">Your career, <em>in cinema.</em></p>
              <p style={{ margin: "10px auto 0", maxWidth: "52ch", color: "var(--dim)" }}>
                These started as an ordinary resume. Yours can premiere to its own address today.
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

// one card = one real, live film. The whole card is a link to the live site. A
// record with a poster shows it; without one, the live site is rendered as a
// self-portrait poster in a dark screen (the design system's .poster monitor),
// exactly like the console's film cards.
function FilmCard({ film }) {
  const title = film.title || film.slug;
  return (
    <li>
      <a
        className="sitecard"
        href={film.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open the live portfolio for ${title} in a new tab`}
      >
        <div className="poster">
          {film.poster
            ? <img
                src={film.poster}
                alt={`Portfolio poster for ${title}`}
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            : <iframe
                title={`Live portfolio preview for ${title}`}
                src={film.url}
                sandbox="allow-scripts"
                loading="lazy"
                scrolling="no"
                tabIndex={-1}
                referrerPolicy="no-referrer"
                aria-hidden="true"
              />}
          <span className="veil" aria-hidden="true" />
        </div>
        <div className="row1">
          <h3 className="cardtitle">{title}</h3>
          <span className="badge live">Live</span>
        </div>
        <span className="mono" style={{ textTransform: "none", letterSpacing: ".04em" }}>
          {hostOf(film.url)}
        </span>
      </a>
    </li>
  );
}

// the human-readable address for the caption, e.g. saad-bougha.cinefolio.dev
function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

// skeletons that match the card shape: a poster block (16/10) plus a title row,
// so the layout does not jump when the real films arrive.
function ShowcaseSkeletons() {
  return (
    <div className="grid" aria-hidden="true" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
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
