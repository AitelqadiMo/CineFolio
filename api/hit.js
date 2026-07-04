// POST /api/hit { page } - lightweight own-analytics: daily counters in Redis
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(200).json({ ok: true });
  const page = ["home", "services", "studio", "contact"].includes((req.body || {}).page) ? req.body.page : "home";
  const day = new Date().toISOString().slice(0, 10);
  try {
    await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["INCR", `cinefolio:hits:${day}:${page}`]),
    });
  } catch {}
  return res.status(200).json({ ok: true });
}
