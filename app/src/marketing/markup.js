// Landing markup: originally ported byte-for-byte from index.html; copy now tracks the live product.
export const LANDING_HTML = `
<div id="loader"><div class="lens"></div><div class="cnt" id="loadCnt">0</div><div class="lbl">CINEFOLIO STUDIOS · ROLLING</div></div>
<div id="progress"><i id="progressBar"></i></div>
<div id="cursor"><div class="ring"><span id="cursorLbl">PLAY</span></div><div class="dot"></div></div>

<nav>
  <a class="brand" href="#/" data-nav><span class="lens"></span>CineFolio</a>
  <div class="tabs">
    <button data-tab="home" class="on">Home</button>
    <button data-tab="services">Services</button>
    <button data-tab="contact">Contact</button>
  </div>
  <button class="joinbtn magnetic" id="joinNav">Enter the Studio</button>
</nav>

<!-- ============ HOME ============ -->
<main data-page="home" class="on">
  <header class="hero">
    <canvas id="silk"></canvas>
    <div class="silk-fallback" id="silkFallback" style="display:none"></div>
    <div class="zellige"></div>
    <div class="inner">
      <div class="kicker"><span class="dot"></span>THE AI FILM STUDIO FOR CAREERS</div>
      <h1 id="heroTitle">Portfolios people<br><span class="serif">fall in love with.</span></h1>
      <p class="sub">Templates all look the same. We cast you as the lead of a <b>cinematic AI film</b>: your story told scene by scene as people scroll, with real film sequences. <b>Premieres in about 20 minutes</b> at yourname.cinefolio.dev. Your first film is on us.</p>
      <div class="cta-row">
        <button class="btn primary magnetic" id="heroEnter">Start free · first AI film on us</button>
        <a class="btn ghost magnetic" href="https://www.aitelqadi.dev" target="_blank" rel="noopener noreferrer">See a live release ↗</a>
      </div>
      <div class="proof">NO CARD, NO WAITLIST · EVERY CAREER GETS ITS OWN LIGHTING · <a href="#" data-goto="services">SEE THE FORMATS</a></div>
    </div>
    <div class="scrollcue">SCROLL ↓</div>
  </header>

  <div class="marquee" aria-hidden="true"><div class="track" id="mqTrack"></div></div>

  <div id="reelwrap">
    <div id="reel">
      <div class="panel-intro">
        <div class="scene">THE RELEASES</div>
        <h2>Four lighting worlds, <span class="serif">one studio.</span></h2>
        <p>All four shot by our AI cameras, each in its own palette. Scroll on: your world is the empty frame at the end.</p>
      </div>
      <div class="cutp"><video autoplay muted loop playsinline preload="metadata" src="https://d8j0ntlcm91z4.cloudfront.net/user_3FP3DZH9AbtiM047fGK5IsVnlDy/hf_20260704_212954_8600e4c3-1335-4834-92f3-59c79847edca.mp4"></video><div class="meta"><span class="chip">The Lavender Cut</span><span class="num">i</span></div></div>
      <div class="cutp"><video autoplay muted loop playsinline preload="metadata" src="https://d8j0ntlcm91z4.cloudfront.net/user_3FP3DZH9AbtiM047fGK5IsVnlDy/hf_20260704_212957_b65bc691-59f0-4da6-be3a-0e33f63a2fd3.mp4"></video><div class="meta"><span class="chip">The Neon Cut</span><span class="num">ii</span></div></div>
      <div class="cutp"><video autoplay muted loop playsinline preload="metadata" src="https://d8j0ntlcm91z4.cloudfront.net/user_3FP3DZH9AbtiM047fGK5IsVnlDy/hf_20260704_213719_17a92337-a259-4517-b389-46e2e81637d9.mp4"></video><div class="meta"><span class="chip">The Daylight Cut</span><span class="num">iii</span></div></div>
      <div class="cutp"><video autoplay muted loop playsinline preload="metadata" src="https://d8j0ntlcm91z4.cloudfront.net/user_3FP3DZH9AbtiM047fGK5IsVnlDy/hf_20260704_144445_9a107d74-7c29-43d9-99b0-5b9fbb397144.mp4"></video><div class="meta"><span class="chip">The Ember Cut</span><span class="num">iv</span></div></div>
      <div class="panel-cta">
        <div class="t">Your world<br>goes here.</div>
        <button class="btn gold magnetic" data-enter>Start your film</button>
      </div>
    </div>
  </div>

  <section class="light">
    <div class="inner-wrap">
      <div class="scene reveal">How it works</div>
      <h2 class="reveal">Three steps to <span class="serif">your premiere.</span></h2>
      <div class="prod">
        <div class="take reveal">
          <div class="n">one</div><h3>Send photos + CV</h3>
          <p>Two or three well-lit photos and your CV. That's the whole brief. No design calls, no forms longer than an espresso.</p>
        </div>
        <div class="take reveal">
          <div class="n">two</div><h3>We film you with AI</h3>
          <p>A 360° hero orbit and story scenes, in the lighting and palette that fits you. Identity-locked and quality-gated, so every frame is unmistakably you.</p>
        </div>
        <div class="take reveal">
          <div class="n">three</div><h3>Your film premieres</h3>
          <p>A scroll-driven site on your own domain: kinetic type, an interactive terminal, verified credentials, CV download. Yours, forever.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="statement">
    <div class="q reveal">“A resume says what you did. A template says you exist. <em>A film says you're worth watching.</em>”</div>
    <div class="who reveal">THE CINEFOLIO PRINCIPLE</div>
  </section>

  <section class="light">
    <div class="inner-wrap">
      <div class="scene reveal">Receipts, not promises</div>
      <div class="receipts reveal">
        <div class="rc"><b>~20MIN</b><span>Resume to live premiere. Same pipeline, every client</span></div>
        <div class="rc"><b>120F</b><span>Frames in the scroll-scrub engine, quality-gated per clip</span></div>
        <div class="rc"><b>4</b><span>Distinct lighting worlds on this page alone. Yours will be new</span></div>
        <div class="rc"><b>1</b><span>Live release already screening on a real custom domain</span></div>
      </div>
      <p class="opensrc reveal">OPEN PRODUCTION · SOURCE AT <a href="https://github.com/AitelqadiMo/CineFolio" target="_blank" rel="noopener noreferrer">GITHUB</a> · LIVE EXAMPLE AT <a href="https://www.aitelqadi.dev" target="_blank" rel="noopener noreferrer">AITELQADI.DEV</a> · THIS SITE IS ITSELF THE DEMO: WEBGL SILK, VELOCITY MARQUEE, PINNED GALLERY, CUSTOM CURSOR</p>
    </div>
  </section>

  
  <section id="platformwrap">
    <div class="scene reveal">The platform underneath</div>
    <h2 class="reveal">Built like infrastructure,<br><span class="serif">felt like cinema.</span></h2>
    <div class="bento">
      <div class="tile wide reveal" style="background-image:linear-gradient(180deg, rgba(10,21,48,.35), rgba(10,21,48,.88)), url('https://pub.hyperagent.com/api/published/pbf01KWSRVRQD_0M8HZ70MCMA3Y4X7/50e7a154-67fa-478b-b4b7-74fe378b3dc4.png')">
        <div class="tk">GLOBAL EDGE HOSTING</div>
        <div class="tt">Your film premieres on our own CDN</div>
        <div class="td">One atomic pointer flip publishes a release worldwide. Rolling back is the same flip, in reverse, in seconds.</div>
        <div class="flip"><span>nadia-benali</span><span class="arr">→</span><span class="rel">releases/<b id="flipN">3</b></span></div>
      </div>
      <div class="tile reveal">
        <div class="tk">REAL ADDRESSES</div>
        <div class="tbig" id="bentoCount">*.cinefolio.dev</div>
        <div class="td">Every film premieres on its own subdomain: yourname.cinefolio.dev. Yours is waiting.</div>
      </div>
      <div class="tile reveal" style="background-image:linear-gradient(180deg, rgba(10,21,48,.3), rgba(10,21,48,.9)), url('https://pub.hyperagent.com/api/published/pbf01KWSRW0ED_ZR9N5ZQNE3HG4577/dde0b377-b779-4c7b-a448-88f1e8d57626.png')">
        <div class="tk">THE ENGINE</div>
        <div class="tt">Two ways to film</div>
        <div class="td">The AI director films a bespoke scroll-story with generated video. Or take The Set: a deterministic engine that renders as you type. Both premiere on the same rails.</div>
      </div>
      <div class="tile reveal">
        <div class="tk">VERSIONED LIKE SOFTWARE</div>
        <div class="tt">Every release, kept</div>
        <div class="td">Publish, stage, preview, go live, roll back, relight. Your portfolio gets the release discipline of production infrastructure.</div>
        <div class="strip"><i></i><i class="on"></i><i></i><i></i></div>
      </div>
      <div class="tile reveal">
        <div class="tk">THE PIPELINE</div>
        <div class="tt">Minutes, not weeks</div>
        <div class="td">Your order travels a state machine that cannot lose it, from resume to live premiere:</div>
        <div class="states"><span>QUEUED</span><span class="s2">FILMING</span><span class="s3">PREMIERE</span></div>
      </div>
    </div>
  </section>

<section id="wlwrap">
    <div class="zellige"></div>
    <div class="wrap" id="waitlist">
      <div class="scene" style="justify-content:center">The cameras are rolling</div>
      <h2>Your first film <span class="serif">is on us.</span></h2>
      <p class="lead">No payment, no waitlist. Create an account, drop your resume and a photo, and the AI director premieres your film at yourname.cinefolio.dev in about twenty minutes. The Set — our manual template engine — stays free forever.</p><div class="cta-row" style="justify-content:center;margin-bottom:26px"><button class="btn primary magnetic" id="wlEnter">Enter the Studio · start free</button></div><p class="lead" style="font-size:.95em;opacity:.8">Prefer studio notes first? Leave your email.</p>
      <form class="wl" id="wl" autocomplete="off">
        <input type="email" id="wlEmail" placeholder="you@domain.com" required>
        <select id="wlRole" aria-label="Your role">
          <option value="engineer">Engineer</option>
          <option value="designer">Designer</option>
          <option value="founder">Founder</option>
          <option value="other">Other</option>
        </select>
        <input class="hp" type="text" name="company" tabindex="-1" aria-hidden="true">
        <button class="btn gold magnetic" type="submit" id="wlBtn">Join</button>
      </form>
      <div class="result" id="wlResult"></div>
      <div class="smallnote" id="wlCount">FREE AI FILM · NO CARD · NO SPAM, EVER</div>
    </div>
  </section>
</main>

<!-- ============ SERVICES ============ -->
<main data-page="services">
  <section class="light" style="min-height:100vh">
    <div class="inner-wrap pageheadpad">
      <div class="scene">Services</div>
      <h2>Pick your <span class="serif">production.</span></h2>
      <div class="packs">
        <div class="pack">
          <div class="head"><div class="k">FORMAT 01</div><h3>The Free Cuts</h3><div class="price">Free · included with every account</div></div>
          <ul>
            <li>Your first AI film: the director shoots your career as a scroll-story, on us</li>
            <li>The Set: every template family, renders as you type, unlimited</li>
            <li>Resume page with a downloadable PDF</li>
            <li>Premieres at yourname.cinefolio.dev in about 20 minutes</li>
            <li>One premiere live at a time</li>
          </ul>
          <div class="foot"><button class="btn magnetic" data-enter>Start free</button></div>
        </div>
        <div class="pack star">
          <div class="flag">MOST LOVED</div>
          <div class="head"><div class="k">FORMAT 02</div><h3>The Director's Cut</h3><div class="price">$99 · one time · 3 productions</div></div>
          <ul>
            <li>Three AI-directed productions: film it, refine it, pick the cut you love</li>
            <li>Full scroll-scrub production: hero orbit, story scenes, section pinning, interactive terminal</li>
            <li>Revision messages to the director with every production</li>
            <li>Publish up to three films, each on its own address</li>
            <li>12 months hosting included · Keep It Live renewal $39/yr after</li>
            <li>Your address, your source export: you own everything</li>
          </ul>
          <div class="foot"><button class="btn primary magnetic" id="joinFromPack">Enter the Studio</button></div>
        </div>
        <div class="pack">
          <div class="head"><div class="k">FORMAT 03</div><h3>The Coach's Slate</h3><div class="price">$295 · 7 productions</div></div>
          <ul>
            <li>Seven Director's Cut productions — $42 a film</li>
            <li>Built for career coaches, agencies and staffing teams</li>
            <li>Each client premieres on their own film and address</li>
            <li>Revision messages included with every production</li>
            <li>One pack, no subscription</li>
          </ul>
          <div class="foot"><button class="btn magnetic" data-goto="contact">Talk to the studio</button></div>
        </div>
      </div>
      <p class="smallnote" style="text-align:center;margin-top:18px">ENTERPRISE, BOOTCAMPS, OUTPLACEMENT — <a href="mailto:info@cinefolio.dev" style="color:var(--red);font-weight:600">TALK TO THE STUDIO</a></p>
      <div class="faq">
        <div class="qa"><b>Why a film instead of a template?</b><p>Attention. A recruiter sees three hundred identical portfolio links a week. A cinematic film of you is the one they forward to a colleague.</p></div>
        <div class="qa"><b>Is the AI video really me?</b><p>Yes. Scenes are generated against your photos as identity references and quality-gated for likeness before anything ships.</p></div>
        <div class="qa"><b>Can I pick my style?</b><p>That's the point. Lavender softness, neon edge, golden daylight, ember drama, or something we invent for you. One style per story.</p></div>
        <div class="qa"><b>Who owns the result?</b><p>You do. Your domain, your repo, your film. We keep nothing but the credit line.</p></div>
      </div>
    </div>
  </section>
</main>

<!-- ============ CONTACT ============ -->
<main data-page="contact">
  <section class="light" style="min-height:100vh">
    <div class="inner-wrap pageheadpad">
      <div class="scene">Contact</div>
      <h2>Talk to the <span class="serif">studio.</span></h2>
      <div class="contact-grid">
        <div class="panel">
          <h3>💌 Send a note</h3>
          <div class="field"><label>Your email</label><input type="email" id="ctEmail" placeholder="you@domain.com"></div>
          <div class="field"><label>Message</label><textarea id="ctMsg" placeholder="Tell us about your story, your deadline, or your questions."></textarea></div>
          <input class="hp" type="text" name="company" tabindex="-1" aria-hidden="true" id="ctHp">
          <button class="btn primary magnetic" id="ctGo" style="width:100%;background:var(--red);border-color:var(--red);color:#fff">Send</button>
          <div class="result" id="ctResult" style="color:var(--green)"></div>
        </div>
        <div>
          <div class="qa"><b>How fast is delivery?</b><p>Typically about twenty minutes from resume to live premiere; intricate cuts can take longer. You watch the whole production live from the Premiere Lounge.</p></div>
          <div class="qa"><b>Will mine look like the reels on the home page?</b><p>No. Every production gets its own lighting, palette and typography. No two releases look alike: that's the whole point.</p></div>
          <div class="qa"><b>Can I try it before writing in?</b><p>Yes. Your first AI film is included with every account, no card — plus unlimited manual filming on The Set. Most questions answer themselves after a premiere. <a href="#" data-enter style="color:var(--red);font-weight:600">Enter the Studio →</a></p></div>
          <div class="qa"><b>The studio inbox</b><p><a href="mailto:info@cinefolio.dev" style="color:var(--red);font-weight:600">Write to us</a>; a human reads everything.</p></div>
        </div>
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="zellige"></div>
  <div class="big">CineFolio<i>•</i>Studios</div>
  <div class="statusline">STUDIO CLOCK <b id="bpTime">--:--</b> CET · STATUS <b id="bpStatus">OPEN</b> · EST. BUDAPEST</div>
  MADE WITH AI CAMERAS AND TASTE · SOURCE ON <a href="https://github.com/AitelqadiMo/CineFolio" target="_blank" rel="noopener noreferrer">GITHUB</a> · LIVE RELEASE AT <a href="https://www.aitelqadi.dev" target="_blank" rel="noopener noreferrer">AITELQADI.DEV</a> · © 2026
  <div class="statusline" style="margin-top:8px"><a href="/terms.html">TERMS</a> · <a href="/privacy.html">PRIVACY</a> · <a href="/refunds.html">REFUNDS</a> · SUPPORT <a href="mailto:info@cinefolio.dev">INFO@CINEFOLIO.DEV</a></div>
</footer>
`;
