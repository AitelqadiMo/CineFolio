// POST /api/callback  { orderId, html }  header: X-CF-Secret
// Receives the director's cut from the production agent and stores it for the client poll.
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

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  const secret = process.env.CF_CALLBACK_SECRET;
  if (!secret || req.headers["x-cf-secret"] !== secret) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const { orderId, html } = req.body || {};
  if (!orderId || !/^[a-zA-Z0-9-]{8,64}$/.test(orderId)) return res.status(400).json({ ok: false, error: "bad_order" });
  if (typeof html !== "string" || html.length < 200 || html.length > 900000 || !/<!doctype html/i.test(html.trim().slice(0, 60))) {
    return res.status(400).json({ ok: false, error: "bad_html" });
  }
  if (!redisEnv()) return res.status(503).json({ ok: false, error: "no_storage" });

  const known = await redis(["EXISTS", `cinefolio:order:${orderId}`]);
  if (known !== 1) return res.status(404).json({ ok: false, error: "unknown_order" });

  await redis(["SET", `cinefolio:cut:${orderId}`, html, "EX", 60 * 60 * 24 * 14]);
  await redis(["SET", `cinefolio:orderstatus:${orderId}`, "ready", "EX", 60 * 60 * 24 * 14]);
  return res.status(200).json({ ok: true });
}
