// CineFolio API — dev placeholder handler.
// Real order/site/profile logic lands in P2-P3; this proves the wiring:
// API Gateway (HTTP) -> Lambda, with a Cognito JWT authorizer on /me.
export const handler = async (event) => {
  const path = event?.requestContext?.http?.path || event?.rawPath || "/";
  const method = event?.requestContext?.http?.method || "GET";
  const claims = event?.requestContext?.authorizer?.jwt?.claims || null;

  const json = (statusCode, body) => ({
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  });

  if (path.endsWith("/health")) {
    return json(200, { ok: true, service: "cinefolio-api", env: process.env.APP_ENV, ts: new Date().toISOString() });
  }
  if (path.endsWith("/me")) {
    return json(200, { ok: true, user: claims ? { sub: claims.sub, email: claims.email } : null });
  }
  return json(404, { ok: false, error: "not_found", path, method });
};
