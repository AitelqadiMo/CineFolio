// Runtime config. Dev values are baked as defaults (all non-secret identifiers);
// override per-environment with VITE_* at build time.
export const CONFIG = {
  apiBase: (import.meta.env.VITE_API_BASE || "https://81ik4yem44.execute-api.eu-central-1.amazonaws.com").replace(/\/$/, ""),
  region: import.meta.env.VITE_AWS_REGION || "eu-central-1",
  userPoolId: import.meta.env.VITE_COGNITO_POOL_ID || "eu-central-1_fy9egwu3p",
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || "op1slsk7v0fdfmbtrpjl9b3n5",
  sitesCdn: import.meta.env.VITE_SITES_CDN || "d3ssuqn0z03akv.cloudfront.net",
  env: import.meta.env.VITE_APP_ENV || "dev",
};
