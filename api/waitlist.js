// POST /api/waitlist  { email, role }
// Stores signups in Upstash Redis (Vercel Marketplace) when configured.
// Works with either Vercel KV env names or Upstash env names.
// With no storage configured it still accepts requests (logged to function logs)
// so the landing page never breaks while storage is being provisioned.

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(cmd) {
  const env = redisEnv();
  if (!env) return null;
  const r = await fetch(env.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).result;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  const { email, role, company } = req.body || {};
  // honeypot: real users never fill "company"
  if (company) return res.status(200).json({ ok: true, position: null });

  const clean = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean) || clean.length > 254) {
    return res.status(400).json({ ok: false, error: "invalid_email" });
  }
  const cleanRole = ["engineer", "designer", "founder", "other"].includes(role) ? role : "other";
  const entry = JSON.stringify({ email: clean, role: cleanRole, at: new Date().toISOString(), ua: req.headers["user-agent"] || "" });

  try {
    if (redisEnv()) {
      const already = await redis(["SISMEMBER", "cinefolio:emails", clean]);
      if (already === 1) {
        const pos = await redis(["LLEN", "cinefolio:waitlist"]);
        return res.status(200).json({ ok: true, position: pos, duplicate: true, stored: true });
      }
      await redis(["SADD", "cinefolio:emails", clean]);
      const len = await redis(["LPUSH", "cinefolio:waitlist", entry]);
      return res.status(200).json({ ok: true, position: len, stored: true });
    }
    console.log("[waitlist:no-storage]", entry); // recoverable from function logs until storage is added
    return res.status(200).json({ ok: true, position: null, stored: false });
  } catch (e) {
    console.error("[waitlist:error]", e.message, entry);
    return res.status(200).json({ ok: true, position: null, stored: false });
  }
}
