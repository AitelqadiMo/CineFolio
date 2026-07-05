// ui.jsx — shared studio-floor primitives: split-char titles, confetti, skeletons,
// friendly error language. Motion is feedback: every effect marks a state change.
export function SplitTitle({ text, serif }) {
  let i = 0;
  const chars = (s, cls) =>
    s.split("").map((ch, k) =>
      ch === " " ? " " : (
        <span key={cls + k} className="chx" style={{ animationDelay: `${(i++) * 22}ms` }}>{ch}</span>
      )
    );
  return (
    <h1>
      {chars(text, "t")}
      {serif && <> <em>{chars(serif, "s")}</em></>}
    </h1>
  );
}

// premiere applause — DOM confetti in the jersey palette, ~1.9s, self-cleaning
export function confetti(host) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#C8102E", "#E63946", "#D9A441", "#0E9E62", "#F4EFE6"];
  const n = 42;
  for (let i = 0; i < n; i++) {
    const c = document.createElement("i");
    c.className = "confetti";
    c.style.left = `${4 + Math.random() * 92}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = `${Math.random() * 350}ms`;
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    (host || document.body).appendChild(c);
    setTimeout(() => c.remove(), 2600);
  }
}

export const Skeleton = ({ h = 92, style }) => <div className="skel" style={{ height: h, ...style }} />;

// human error language — never a raw error string without a next step
export function friendly(message) {
  const m = String(message || "");
  if (/order cut not ready/i.test(m)) return "The director's cut isn't in yet — premiere the rough cut now, or wait for the studio email.";
  if (/slug taken/i.test(m)) return "That premiere name is taken. Pick another slug — it becomes your URL.";
  if (/Session expired/i.test(m)) return "Your session expired. Sign in again and you're right back here.";
  if (/network|fetch/i.test(m)) return "Network hiccup — give it a second and try again.";
  if (/internal_error/i.test(m)) return "The studio hit a snag on our side. Try again; if it repeats, we're already alarmed about it.";
  if (/status .* not retryable/i.test(m)) return "This order already premiered — nothing to retry.";
  return m;
}
