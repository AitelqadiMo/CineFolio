// Landing markup: originally ported byte-for-byte from index.html; copy now tracks the live product.
export const LANDING_HTML = `
<div id="loader"><div class="lens"></div><div class="cnt" id="loadCnt">0</div><div class="lbl">CINEFOLIO STUDIOS · ROLLING</div></div>
<div id="progress"><i id="progressBar"></i></div>
<div id="cursor"><div class="ring"><span id="cursorLbl">PLAY</span></div><div class="dot"></div></div>

<nav>
  <a class="brand" href="#/" data-nav><span class="lens"></span>CineFolio</a>
  <div class="tabs">
    <button data-tab="home" class="on">Home</button>
    <!-- data-tab value stays "services" so the hash router in effects.js keeps working; only the visible label changes to "Plans" to read as software pricing, not a service menu. -->
    <button data-tab="services">Plans</button>
    <button data-tab="contact">Contact</button>
  </div>
  <!-- "Open the App" (not "Enter the Studio") so the primary nav CTA reads as launching software, not booking a studio. -->
  <button class="joinbtn magnetic" id="joinNav">Open the App</button>
</nav>

<!-- ============ HOME ============ -->
<main data-page="home" class="on">
  <header class="hero">
    <canvas id="silk"></canvas>
    <div class="silk-fallback" id="silkFallback" style="display:none"></div>
    <div class="zellige"></div>
    <div class="inner">
      <div class="kicker"><span class="dot"></span>THE SELF-SERVE AI FILM APP FOR CAREERS</div>
      <h1 id="heroTitle">Portfolios people<br><span class="serif">fall in love with.</span></h1>
      <p class="sub">Templates all look the same. CineFolio is software that casts <b>you</b> as the lead of a <b>cinematic AI film</b>: you upload your resume and photos, pick a look, and the app renders your story scene by scene as people scroll. <b>The app builds it in about 20 minutes</b> at yourname.cinefolio.dev. Your first render is on the house.</p>
      <div class="cta-row">
        <button class="btn primary magnetic" id="heroEnter">Sign up free · first render on us</button>
        <a class="btn ghost magnetic" href="https://www.aitelqadi.dev" target="_blank" rel="noopener noreferrer">See a live example ↗</a>
      </div>
      <!-- Reviewer-facing framing: "you upload / the app renders / you publish" makes the self-serve nature explicit right in the hero. No card, because the free render is a real product tier, not a trial of a service. -->
      <div class="proof">NO CARD, NO WAITLIST · YOU UPLOAD, THE APP RENDERS · <a href="#" data-goto="services">SEE THE PLANS</a></div>
    </div>
    <div class="scrollcue">SCROLL ↓</div>
  </header>

  <div class="marquee" aria-hidden="true"><div class="track" id="mqTrack"></div></div>

  <div id="reelwrap">
    <div id="reel">
      <div class="panel-intro">
        <div class="scene">THE TEMPLATES</div>
        <h2>Four lighting worlds, <span class="serif">one engine.</span></h2>
        <p>Four looks the app can render, each in its own palette. Scroll on: your world is the empty frame at the end, waiting for you to fill it.</p>
      </div>
      <div class="cutp"><video autoplay muted loop playsinline preload="metadata" src="https://d8j0ntlcm91z4.cloudfront.net/user_3FP3DZH9AbtiM047fGK5IsVnlDy/hf_20260704_212954_8600e4c3-1335-4834-92f3-59c79847edca.mp4"></video><div class="meta"><span class="chip">The Lavender Cut</span><span class="num">i</span></div></div>
      <div class="cutp"><video autoplay muted loop playsinline preload="metadata" src="https://d8j0ntlcm91z4.cloudfront.net/user_3FP3DZH9AbtiM047fGK5IsVnlDy/hf_20260704_212957_b65bc691-59f0-4da6-be3a-0e33f63a2fd3.mp4"></video><div class="meta"><span class="chip">The Neon Cut</span><span class="num">ii</span></div></div>
      <div class="cutp"><video autoplay muted loop playsinline preload="metadata" src="https://d8j0ntlcm91z4.cloudfront.net/user_3FP3DZH9AbtiM047fGK5IsVnlDy/hf_20260704_213719_17a92337-a259-4517-b389-46e2e81637d9.mp4"></video><div class="meta"><span class="chip">The Daylight Cut</span><span class="num">iii</span></div></div>
      <div class="cutp"><video autoplay muted loop playsinline preload="metadata" src="https://d8j0ntlcm91z4.cloudfront.net/user_3FP3DZH9AbtiM047fGK5IsVnlDy/hf_20260704_144445_9a107d74-7c29-43d9-99b0-5b9fbb397144.mp4"></video><div class="meta"><span class="chip">The Ember Cut</span><span class="num">iv</span></div></div>
      <div class="panel-cta">
        <div class="t">Your world<br>goes here.</div>
        <button class="btn gold magnetic" data-enter>Build your film</button>
      </div>
    </div>
  </div>

  <section class="light">
    <div class="inner-wrap">
      <div class="scene reveal">How it works</div>
      <h2 class="reveal">Three steps you drive <span class="serif">yourself.</span></h2>
      <!-- Each step is a user action or a software action, never a studio-does-it-for-you action. This is the clearest possible signal that CineFolio is self-serve software, not a done-for-you service. -->
      <div class="prod">
        <div class="take reveal">
          <div class="n">one</div><h3>You upload photos + CV</h3>
          <p>Sign in, then upload two or three well-lit photos of yourself and your CV. That's the whole input. No design calls, no forms longer than an espresso.</p>
        </div>
        <div class="take reveal">
          <div class="n">two</div><h3>You pick a look, the app renders</h3>
          <p>Choose your lighting and palette, then click render. The app generates a 360° hero orbit and story scenes from what you uploaded. Identity-locked and quality-gated, so every frame is unmistakably you.</p>
        </div>
        <div class="take reveal">
          <div class="n">three</div><h3>You publish your film</h3>
          <p>Hit publish and the app hosts your scroll-driven site on your own domain: kinetic type, an interactive terminal, verified credentials, CV download. Yours, forever.</p>
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
        <div class="rc"><b>~20MIN</b><span>From your upload to a site the app has published. Same engine every run</span></div>
        <div class="rc"><b>120F</b><span>Frames in the scroll-scrub engine, quality-gated per clip</span></div>
        <div class="rc"><b>4</b><span>Distinct lighting worlds on this page alone. Yours will be new</span></div>
        <div class="rc"><b>1</b><span>Live example already screening on a real custom domain</span></div>
      </div>
      <p class="opensrc reveal">OPEN SOURCE · CODE AT <a href="https://github.com/AitelqadiMo/CineFolio" target="_blank" rel="noopener noreferrer">GITHUB</a> · LIVE EXAMPLE AT <a href="https://www.aitelqadi.dev" target="_blank" rel="noopener noreferrer">AITELQADI.DEV</a> · THIS SITE IS ITSELF THE DEMO: WEBGL SILK, VELOCITY MARQUEE, PINNED GALLERY, CUSTOM CURSOR</p>
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
        <div class="tt">Two render modes</div>
        <div class="td">Run the AI mode: the app renders a scroll-story with generated video from your uploads. Or use The Set: a deterministic engine that rebuilds as you type. You drive both, and both publish on the same rails.</div>
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
        <div class="td">When you click render, the job travels a state machine that cannot lose it, from your upload to a published site:</div>
        <div class="states"><span>QUEUED</span><span class="s2">RENDERING</span><span class="s3">PUBLISHED</span></div>
      </div>
    </div>
  </section>

<section id="wlwrap">
    <div class="zellige"></div>
    <div class="wrap" id="waitlist">
      <div class="scene" style="justify-content:center">Your first render is free</div>
      <h2>Your first film <span class="serif">is on us.</span></h2>
      <p class="lead">No payment, no waitlist. Create an account, upload your own resume and a photo, pick a look, and click render. The app builds and publishes your film at yourname.cinefolio.dev in about twenty minutes. You do the driving; the software does the rendering. The Set, our manual template engine, stays free forever.</p><div class="cta-row" style="justify-content:center;margin-bottom:26px"><button class="btn primary magnetic" id="wlEnter">Sign up · first render free</button></div><p class="lead" style="font-size:.95em;opacity:.8">Prefer product updates first? Leave your email.</p>
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

<!-- ============ PLANS (data-page stays "services" for the router) ============ -->
<main data-page="services">
  <section class="light" style="min-height:100vh">
    <div class="inner-wrap pageheadpad">
      <div class="scene">Plans</div>
      <h2>Pick your <span class="serif">plan.</span></h2>
      <!-- Plans are software plans priced in render credits. A credit is one run of the app. This is the reviewer-critical reframe: you are buying software usage, not commissioning work. -->
      <p class="smallnote" style="text-align:center;margin:-6px 0 22px">CINEFOLIO IS SELF-SERVE SOFTWARE · YOU UPLOAD YOUR OWN RESUME AND PHOTOS, PICK A TEMPLATE, AND THE APP RENDERS AND HOSTS YOUR SITE · A CREDIT IS ONE RENDER YOU RUN</p>
      <div class="packs">
        <div class="pack">
          <div class="head"><div class="k">PLAN 01</div><h3>The Free Cuts</h3><div class="price">Free · included with every account</div></div>
          <ul>
            <li>1 AI render credit: upload your resume and photos, pick a look, and the app builds your scroll-story</li>
            <li>The Set: every template family, rebuilds as you type, unlimited</li>
            <li>Resume page with a downloadable PDF</li>
            <li>You publish at yourname.cinefolio.dev in about 20 minutes</li>
            <li>Sites from the free AI credit stay live for 72 hours · Set sites stay up</li>
          </ul>
          <div class="foot"><button class="btn magnetic" data-enter>Sign up free</button></div>
        </div>
        <div class="pack star">
          <!-- Founding-cohort scarcity is real and specific: $49 for the first 20 members, $99 once the cohort fills. Do not invent a different number. The seats-left line below is a static placeholder; wire it to the real signup count before launch. -->
          <div class="flag">FOUNDING · FIRST 20</div>
          <div class="head"><div class="k">PLAN 02</div><h3>The Director's Cut</h3><div class="price">$49 founding · one time · 3 render credits</div></div>
          <ul>
            <li><b>Founding price: $49 for the first 20 members, then $99.</b> One-time software purchase, not a subscription</li>
            <li>3 AI render credits to run the app: render it, adjust your inputs, re-render, keep the cut you love</li>
            <li><b>Sites you publish stay live</b>: no 72-hour clock</li>
            <li>Full scroll-scrub render: hero orbit, story scenes, section pinning, interactive terminal</li>
            <li>Re-render from new inputs any time a credit is on your balance</li>
            <li>Publish up to three sites, each on its own address</li>
            <li>12 months hosting included · Keep It Live renewal $39/yr after</li>
            <li>Your address, your source export: you own everything</li>
          </ul>
          <!-- SEATS-LEFT PLACEHOLDER: replace with the live founding-member count from the API. Keep the claim honest: show real remaining seats out of 20, or remove the line once the cohort fills and the price steps to $99. -->
          <div class="smallnote" style="margin:2px 0 14px;opacity:.85">FOUNDING SEATS ARE LIMITED TO 20 · PRICE STEPS TO $99 WHEN THEY FILL</div>
          <div class="foot"><button class="btn primary magnetic" id="joinFromPack">Get 3 credits · $49</button></div>
        </div>
      </div>
      <p class="smallnote" style="text-align:center;margin-top:18px">TEAMS AND VOLUME LICENSES · <a href="mailto:info@cinefolio.dev" style="color:var(--red);font-weight:600">EMAIL THE TEAM</a></p>
      <div class="faq">
        <div class="qa"><b>Is CineFolio self-serve software or a done-for-you service?</b><p>Self-serve software, full stop. You sign in, you upload your own resume and photos, you choose the template and look, and you click render. The app generates and hosts your site, then you publish it yourself. Nobody at CineFolio does the work for you. It is your input, your choices, and our software doing the build.</p></div>
        <div class="qa"><b>What is a render credit?</b><p>One credit is one run of the app: one AI render from your uploaded inputs. Free Cuts includes 1 credit. The Director's Cut includes 3. You spend them whenever you want to build or rebuild a film.</p></div>
        <div class="qa"><b>Is the AI video really me, and whose likeness does it use?</b><p>Only yours. The AI-generated imagery is created solely from the photos you upload of yourself, used as identity references, and quality-gated for likeness before the app publishes anything. CineFolio never generates the likeness of any third party or of anyone whose photos you did not upload as your own.</p></div>
        <div class="qa"><b>Can I pick my style?</b><p>That's the point. In the app you choose your world: lavender softness, neon edge, golden daylight, ember drama. One style per film, and you can re-render in a new look with another credit.</p></div>
        <div class="qa"><b>Who owns the result?</b><p>You do. Your domain, your repo, your film. The software keeps nothing but the credit line in the footer.</p></div>
      </div>
      <!-- REAL SOCIAL PROOF PLACEHOLDER: add genuine testimonials or a verified member count here once we have them. Do NOT invent quotes, star ratings, or customer numbers. -->
      <!-- e.g. <div class="testimonials">...real, attributable quotes only...</div> -->
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
          <div class="field"><label>Message</label><textarea id="ctMsg" placeholder="Questions about the app, plans, or credits? Ask away."></textarea></div>
          <input class="hp" type="text" name="company" tabindex="-1" aria-hidden="true" id="ctHp">
          <button class="btn primary magnetic" id="ctGo" style="width:100%;background:var(--red);border-color:var(--red);color:#fff">Send</button>
          <div class="result" id="ctResult" style="color:var(--green)"></div>
        </div>
        <div>
          <div class="qa"><b>How fast is a render?</b><p>Typically about twenty minutes from your upload to a site the app has published; intricate looks can take longer. You watch your own render progress live in the Premiere Lounge inside the app.</p></div>
          <div class="qa"><b>Will mine look like the reels on the home page?</b><p>No. You choose your own lighting, palette and typography, so no two sites look alike. That's the whole point.</p></div>
          <div class="qa"><b>Can I try it before writing in?</b><p>Yes. Your first AI render is included with every account, no card, plus unlimited manual building on The Set. Most questions answer themselves once you have run the app once. <a href="#" data-enter style="color:var(--red);font-weight:600">Sign up and try it →</a></p></div>
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
