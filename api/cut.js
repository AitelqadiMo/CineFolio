// GET /api/cut?id=orderId -> { html } when the director's cut is ready
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const id = String(req.query.id || "");
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return res.status(400).json({ ok: false });
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(404).json({ ok: false });
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", `cinefolio:cut:${id}`]),
    });
    const j = await r.json();
    if (!j.result) return res.status(404).json({ ok: false });
    return res.status(200).json({ ok: true, html: j.result });
  } catch {
    return res.status(404).json({ ok: false });
  }
}
