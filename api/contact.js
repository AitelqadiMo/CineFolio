// POST /api/contact  { email, message }
function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const { email, message, company } = req.body || {};
  if (company) return res.status(200).json({ ok: true }); // honeypot
  const clean = String(email || "").trim().toLowerCase();
  const msg = String(message || "").trim().slice(0, 2000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean) || msg.length < 5) {
    return res.status(400).json({ ok: false, error: "invalid" });
  }
  const entry = JSON.stringify({ email: clean, message: msg, at: new Date().toISOString() });
  try {
    const env = redisEnv();
    if (env) {
      const r = await fetch(env.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["LPUSH", "cinefolio:contact", entry]),
      });
      if (!r.ok) throw new Error(`redis ${r.status}`);
    } else {
      console.log("[contact:no-storage]", entry);
    }
  } catch (e) { console.error("[contact:error]", e.message, entry); }
  return res.status(200).json({ ok: true });
}
