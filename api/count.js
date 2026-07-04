// GET /api/count — waitlist size for social proof (null when storage not configured)
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(200).json({ count: null });
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["LLEN", "cinefolio:waitlist"]),
    });
    const j = await r.json();
    return res.status(200).json({ count: typeof j.result === "number" ? j.result : null });
  } catch {
    return res.status(200).json({ count: null });
  }
}
