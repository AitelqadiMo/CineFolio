// GET /api/status?id=orderId -> { status: "rough" | "ready" | "unknown" }
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const id = String(req.query.id || "");
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return res.status(400).json({ status: "unknown" });
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(200).json({ status: "rough" });
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", `cinefolio:orderstatus:${id}`]),
    });
    const j = await r.json();
    return res.status(200).json({ status: j.result === "ready" ? "ready" : "rough" });
  } catch {
    return res.status(200).json({ status: "rough" });
  }
}
