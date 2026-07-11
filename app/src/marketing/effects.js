// effects.js: the landing page's full cinematic engine, ported verbatim from
// index.html and adapted for (1) React mount/unmount and (2) the AWS API.
// Libraries (gsap, ScrollTrigger, Lenis, THREE) load from CDN in index.html;
// every block degrades gracefully if one is missing, exactly like the original.
import { CONFIG } from "../config.js";

const API = CONFIG.apiBase;

export function initLanding(root, opts = {}) {
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;
  const isDesktop = matchMedia("(min-width: 901px)").matches;
  const { gsap, ScrollTrigger, Lenis, THREE } = window;

  // cleanup registry
  const timers = [], rafs = { live: true }, winEvents = [], observers = [];
  const on = (target, ev, fn, opts2) => { target.addEventListener(ev, fn, opts2); winEvents.push([target, ev, fn]); };

  /* ================= PRELOADER (full show once per session) ================= */
  (function () {
    const loader = $("#loader"), cnt = $("#loadCnt");
    if (sessionStorage.getItem("cf.seenLoader")) { loader.classList.add("done"); return; }
    let n = 0;
    const t = setInterval(() => {
      n = Math.min(100, n + Math.ceil(Math.random() * 14));
      cnt.textContent = n;
      if (n >= 100) { clearInterval(t); setTimeout(() => loader.classList.add("done"), 250); sessionStorage.setItem("cf.seenLoader", "1"); }
    }, 90);
    timers.push(t);
  })();

  /* ================= SMOOTH SCROLL + PROGRESS ================= */
  let lenis = null;
  if (!reduceMotion && typeof Lenis !== "undefined") {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    (function raf(t) { if (!rafs.live) return; lenis.raf(t); requestAnimationFrame(raf); })(0);
  }
  (function () {
    const bar = $("#progressBar");
    function upd() {
      const st = document.documentElement.scrollTop || document.body.scrollTop;
      const mx = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${mx > 0 ? st / mx : 0})`;
    }
    lenis ? lenis.on("scroll", upd) : on(window, "scroll", upd, { passive: true });
    upd();
  })();

  /* ================= CUSTOM CURSOR + MAGNETIC ================= */
  if (finePointer && !reduceMotion) {
    const cur = $("#cursor");
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    on(window, "mousemove", (e) => { tx = e.clientX; ty = e.clientY; });
    (function loop() {
      if (!rafs.live) return;
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
      cur.style.transform = `translate(${cx}px,${cy}px)`;
      requestAnimationFrame(loop);
    })();
    const grow = (sel) => $$(sel).forEach((el) => {
      el.addEventListener("mouseenter", () => { cur.classList.add("grow"); $("#cursorLbl").textContent = el.dataset.cursor || "GO"; });
      el.addEventListener("mouseleave", () => cur.classList.remove("grow"));
    });
    grow(".cutp"); grow(".btn"); grow(".joinbtn"); grow(".tabs button");
    $$(".cutp").forEach((el) => (el.dataset.cursor = "PLAY"));
    $$(".magnetic").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.18}px,${dy * 0.18}px)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  /* ================= WEBGL SILK RIBBON ================= */
  (function () {
    const canvas = $("#silk");
    const fallback = () => { canvas.style.display = "none"; $("#silkFallback").style.display = "block"; };
    if (reduceMotion || typeof THREE === "undefined") { fallback(); return; }
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
      cam.position.set(0, 0, 7);
      const geo = new THREE.PlaneGeometry(16, 5, 120, 24);
      const colors = [];
      const jersey = [new THREE.Color("#C8102E"), new THREE.Color("#D9A441"), new THREE.Color("#0E9E62"), new THREE.Color("#132550")];
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getX(i) + 8) / 16;
        const c = t < 0.33 ? jersey[0].clone().lerp(jersey[1], t * 3) : t < 0.66 ? jersey[1].clone().lerp(jersey[2], (t - 0.33) * 3) : jersey[2].clone().lerp(jersey[3], (t - 0.66) * 3);
        colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -0.35; mesh.rotation.z = -0.12; mesh.position.y = -0.4;
      scene.add(mesh);
      let mx = 0, my = 0, scrollAmp = 0;
      on(window, "mousemove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
      if (lenis) lenis.on("scroll", ({ velocity }) => { scrollAmp = Math.min(Math.abs(velocity || 0) / 40, 1); });
      const base = pos.array.slice();
      function size() {
        const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
        renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
      }
      size(); on(window, "resize", size);
      const t0 = performance.now();
      (function tick(now) {
        if (!rafs.live) { renderer.dispose(); return; }
        const t = (now - t0) / 1000;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3], y = base[i * 3 + 1];
          pos.setZ(i, Math.sin(x * 0.8 + t * 0.9) * 0.35 + Math.sin(y * 2.2 + t * 1.3) * 0.22 + Math.sin(x * 2.1 - t * 0.6) * (0.14 + scrollAmp * 0.3));
        }
        pos.needsUpdate = true;
        mesh.rotation.y = mx * 0.18; mesh.rotation.x = -0.35 + my * 0.1;
        scrollAmp *= 0.95;
        renderer.render(scene, cam);
        requestAnimationFrame(tick);
      })(t0);
    } catch (e) { fallback(); }
  })();

  /* ================= SPLIT-CHAR HERO REVEAL ================= */
  (function () {
    if (reduceMotion || typeof gsap === "undefined") return;
    const h = $("#heroTitle");
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          // chars animate individually, but each WORD is wrapped whole so a
          // line can never break mid-word (the PORTFOLIOS PEOPL/E bug)
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((token) => {
            if (!token) return;
            if (/^\s+$/.test(token)) { frag.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span");
            w.className = "chword";
            w.style.display = "inline-block";
            w.style.whiteSpace = "nowrap";
            token.split("").forEach((ch) => {
              const s = document.createElement("span"); s.className = "ch"; s.textContent = ch; w.appendChild(s);
            });
            frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== "BR" && !n.classList.contains("serif")) { walk(n); }
      });
    };
    walk(h);
    const serif = h.querySelector(".serif");
    if (serif) { serif.style.display = "inline-block"; gsap.set(serif, { y: "0.9em", opacity: 0 }); }
    const delay = sessionStorage.getItem("cf.seenLoader") === "1" && $("#loader").classList.contains("done") ? 0.25 : 1.15;
    gsap.to(h.querySelectorAll(".ch"), { y: 0, opacity: 1, duration: 1.05, ease: "power4.out", stagger: 0.022, delay });
    if (serif) gsap.to(serif, { y: 0, opacity: 1, duration: 1.1, ease: "power4.out", delay: delay + 0.4 });
  })();

  /* ================= VELOCITY MARQUEE + PINNED REEL ================= */
  const mqItems = [["NOW CASTING", "r"], ["YOUR COLORS, YOUR LIGHTING", "g"], ["IDENTITY-LOCKED AI FILM", "gd"], ["INTERACTIVE TERMINAL", "r"], ["VERIFIED CREDENTIALS", "g"], ["YOURNAME.CINEFOLIO.DEV", "gd"], ["PREMIERE IN MINUTES", "r"]];
  $("#mqTrack").innerHTML = mqItems.map(([s, c]) => `<span class="${c}">${s}</span><span>✦</span>`).join("").repeat(3);
  if (!reduceMotion && typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
    if (lenis) lenis.on("scroll", ScrollTrigger.update);
    const track = $("#mqTrack");
    gsap.to(track, { xPercent: -33.33, ease: "none", duration: 26, repeat: -1 });
    const skewTo = gsap.quickTo(track, "skewX", { duration: 0.4, ease: "power2.out" });
    ScrollTrigger.create({ onUpdate(self) { skewTo(gsap.utils.clamp(-10, 10, self.getVelocity() / -160)); } });
    if (isDesktop) {
      const reel = $("#reel");
      const getW = () => reel.scrollWidth - innerWidth;
      const reelST = gsap.to(reel, {
        x: () => -getW(), ease: "none",
        scrollTrigger: { trigger: "#reelwrap", start: "top top", end: () => "+=" + getW(), scrub: 0.6, pin: true, invalidateOnRefresh: true },
      });
      $$(".cutp video").forEach((v) => {
        gsap.fromTo(v, { scale: 1.12 }, { scale: 1, ease: "none", scrollTrigger: { trigger: v, containerAnimation: reelST, start: "left right", end: "right left", scrub: true } });
      });
    }
  }

  /* ================= reveal on scroll ================= */
  const ro = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); } }), { threshold: 0.12 });
  $$(".reveal").forEach((el) => ro.observe(el));
  observers.push(ro);

  /* ================= tab router (hash, like the original site) ================= */
  const pages = $$("main[data-page]");
  const tabs = $$(".tabs button");
  function go(name, push = true) {
    pages.forEach((p) => p.classList.toggle("on", p.dataset.page === name));
    tabs.forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    if (push) history.replaceState(null, "", "#/" + (name === "home" ? "" : name));
    window.scrollTo({ top: 0 });
    if (typeof ScrollTrigger !== "undefined") setTimeout(() => ScrollTrigger.refresh(), 80);
    if (push) hit(name);
  }
  tabs.forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
  $$("[data-goto]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); go(el.dataset.goto); }));
  $("[data-nav]").addEventListener("click", (e) => { e.preventDefault(); go("home"); });
  const route = () => { const h = location.hash.replace("#/", ""); go(["services", "contact"].includes(h) ? h : "home", false); };
  on(window, "hashchange", route);
  route();

  /* ================= enter-the-studio (auth) + waitlist shortcuts ================= */
  function toWaitlist() { go("home"); setTimeout(() => { const el = $("#waitlist"); lenis ? lenis.scrollTo(el) : el.scrollIntoView({ behavior: "smooth" }); }, 120); }
  $("#joinNav").addEventListener("click", () => opts.onEnter && opts.onEnter());
  ["#heroEnter", "#wlEnter"].forEach((sel) => {
    const el = $(sel);
    if (el) el.addEventListener("click", () => opts.onEnter && opts.onEnter());
  });
  const jp = $("#joinFromPack"); if (jp) jp.addEventListener("click", () => (opts.onEnter ? opts.onEnter() : toWaitlist()));
  // any element marked data-enter is a sign-up door (reel end card, Free Cuts
  // pack, contact nudge); the waitlist section stays the no-auth fallback
  $$("[data-enter]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); if (opts.onEnter) opts.onEnter(); else toWaitlist(); }));

  /* ================= own-analytics (AWS API) ================= */
  function hit(page) { try { fetch(`${API}/hit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page }) }).catch(() => {}); } catch (e) { /* noop */ } }
  hit(location.hash.replace("#/", "") || "home");

  /* ================= studio notes count (AWS API) =================
     bentoCount is the REAL ADDRESSES card now; it keeps its static
     *.cinefolio.dev text and no counter may overwrite it. */
  fetch(`${API}/waitlist/count`).then((r) => r.json()).then(({ count }) => {
    if (count && count > 4) $("#wlCount").textContent = count + " ON THE STUDIO LIST · THREE FREE FILMS · NO SPAM";
  }).catch(() => { /* the note keeps its default line */ });
  // bento pointer-flip tick: the release number advances like a live deploy
  const flipN = $("#flipN");
  if (flipN && !reduceMotion) { let fn = 3; timers.push(setInterval(() => { fn = fn >= 9 ? 2 : fn + 1; flipN.textContent = fn; }, 4000)); }
  $("#wl").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#wlBtn"), out = $("#wlResult");
    btn.disabled = true; btn.textContent = "…";
    try {
      const r = await fetch(`${API}/waitlist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("#wlEmail").value, role: $("#wlRole").value, company: $("#wl .hp").value }) });
      const j = await r.json();
      if (j.ok) { out.textContent = j.already ? "Already on the list. We got you." : "You're in. We'll be in touch."; $("#wl").style.display = "none"; }
      else { out.textContent = "That email does not look right."; btn.disabled = false; btn.textContent = "Join"; }
    } catch { out.textContent = "Network hiccup, try again."; btn.disabled = false; btn.textContent = "Join"; }
  });

  /* ================= contact (AWS API) ================= */
  $("#ctGo").addEventListener("click", async () => {
    const btn = $("#ctGo"), out = $("#ctResult");
    btn.disabled = true; btn.textContent = "…";
    try {
      const r = await fetch(`${API}/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("#ctEmail").value, message: $("#ctMsg").value, company: $("#ctHp").value }) });
      const j = await r.json();
      out.textContent = j.ok ? "Sent. The studio will get back to you." : "Check the email and message, then retry.";
      if (j.ok) $("#ctMsg").value = "";
    } catch { out.textContent = "Network hiccup, try again."; }
    btn.disabled = false; btn.textContent = "Send";
  });

  /* ================= live studio clock ================= */
  (function () {
    function tick() {
      try {
        const now = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" });
        $("#bpTime").textContent = now;
        const h = parseInt(now.split(":")[0], 10);
        $("#bpStatus").textContent = h >= 9 && h < 23 ? "OPEN" : "AFTER HOURS";
      } catch (e) { /* noop */ }
    }
    tick(); timers.push(setInterval(tick, 30000));
  })();

  /* ================= cleanup ================= */
  return function cleanup() {
    rafs.live = false;
    timers.forEach(clearInterval);
    winEvents.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn));
    observers.forEach((o) => o.disconnect());
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.getAll().forEach((st) => st.kill());
    if (typeof gsap !== "undefined") gsap.globalTimeline.clear();
    if (lenis) lenis.destroy();
    document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-stopped");
  };
}
