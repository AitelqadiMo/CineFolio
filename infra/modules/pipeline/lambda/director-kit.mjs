// CineDepth: the first-party, dependency-free motion and depth grammar handed to
// every AI Director run. The generated page owns the art direction; this kit
// supplies reliable mechanics, one animation frame loop, and static fallbacks.
export const DIRECTOR_KIT_VERSION = "depth-v1";

export const DIRECTOR_KIT = [
  "<script data-cf-kit=\"depth-v1\">",
  "(()=>{const d=document.documentElement,rm=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer: coarse)');",
  "const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));let ticking=0;",
  "const reveal=()=>{const els=[...document.querySelectorAll('[data-reveal]')];if(!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('inview'));return}const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('inview');io.unobserve(e.target)}}),{threshold:.16});els.forEach(e=>io.observe(e))};",
  "const frame=()=>{ticking=0;const max=document.body.scrollHeight-innerHeight,p=max>0?scrollY/max:0;d.style.setProperty('--scroll',p.toFixed(4));if(rm.matches)return;document.querySelectorAll('[data-pin]').forEach(sec=>{const r=sec.getBoundingClientRect(),span=r.height-innerHeight;if(span<=0)return;const q=clamp(-r.top/span);sec.style.setProperty('--pin',q.toFixed(4));const v=sec.querySelector('video[data-scrub]');if(v&&v.duration&&Number.isFinite(v.duration)){try{v.currentTime=v.duration*q}catch{}}});document.querySelectorAll('[data-depth]').forEach(el=>{const r=el.getBoundingClientRect(),mid=r.top+r.height/2-innerHeight/2,rate=Number(el.dataset.depth||.12);el.style.setProperty('--depth-y',`${(-mid*rate).toFixed(2)}px`)});};",
  "const schedule=()=>{if(!ticking){ticking=requestAnimationFrame(frame)}};",
  "const tilt=()=>{if(coarse.matches||rm.matches)return;document.querySelectorAll('[data-tilt]').forEach(el=>{const amount=Math.min(12,Math.max(2,Number(el.dataset.tilt||7)));el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.setProperty('--tilt-x',`${(-y*amount).toFixed(2)}deg`);el.style.setProperty('--tilt-y',`${(x*amount).toFixed(2)}deg`)});el.addEventListener('pointerleave',()=>{el.style.setProperty('--tilt-x','0deg');el.style.setProperty('--tilt-y','0deg')})})};",
  "const start=()=>{reveal();tilt();addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule,{passive:true});rm.addEventListener?.('change',schedule);frame()};document.readyState==='loading'?addEventListener('DOMContentLoaded',start,{once:true}):start()})();",
  "</scr"+"ipt>",
  "<style data-cf-kit=\"depth-v1\">",
  ":root{--scroll:0;--pin:0;--depth-y:0px;--tilt-x:0deg;--tilt-y:0deg}html{overflow-x:clip}img,video{max-width:100%}",
  "[data-reveal]{opacity:0;transform:translate3d(0,30px,0);transition:opacity .9s cubic-bezier(.22,1,.36,1),transform .9s cubic-bezier(.22,1,.36,1)}[data-reveal].inview{opacity:1;transform:none}[data-reveal='2']{transition-delay:.12s}[data-reveal='3']{transition-delay:.24s}",
  "[data-pin]{height:280vh;position:relative}[data-pin]>.stage{position:sticky;top:0;height:100vh;overflow:hidden}",
  "[data-depth]{transform:translate3d(0,var(--depth-y),0);will-change:transform}",
  "[data-tilt]{transform:perspective(1100px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y));transform-style:preserve-3d;will-change:transform;transition:transform .18s ease-out}[data-tilt]>*{transform:translateZ(var(--z,0px))}",
  "[data-depth-stage]{perspective:1200px;transform-style:preserve-3d;isolation:isolate}[data-depth-plane]{position:absolute;inset:0;transform:translate3d(var(--x,0),var(--y,0),var(--z,0));transform-style:preserve-3d;pointer-events:none}",
  "@media(max-width:600px),(pointer:coarse){[data-tilt]{transform:none!important}[data-depth]{--depth-y:0px!important}[data-pin]{height:auto}[data-pin]>.stage{position:relative;height:auto;min-height:100svh}}",
  "@media(max-height:620px){[data-pin]{height:auto}[data-pin]>.stage{position:relative;height:auto;min-height:100svh}}",
  "@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}[data-reveal]{opacity:1;transform:none;transition:none}[data-pin]{height:auto}[data-pin]>.stage{position:relative;height:auto;min-height:0}[data-depth],[data-tilt],[data-depth-plane]{transform:none!important;transition:none!important}video[data-scrub]{display:none}}",
  "</style>",
].join("\n");
