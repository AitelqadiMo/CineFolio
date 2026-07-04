# CineFolio

**Your career, filmed.** Cinematic AI portfolios: identity-locked AI scenes,
scroll-driven film sites, interactive terminal, verified credentials, shipped
to your own domain in a day.

This repo is the demand-test landing page + waitlist.

## Stack

- `index.html` — static cinematic landing (Clash Display / Space Grotesk / JetBrains Mono)
- `api/waitlist.js` — Vercel serverless function (Node), stores signups in Upstash Redis
- `api/count.js` — waitlist size for social proof
- Zero npm dependencies, zero build step. Deploys on Vercel as-is.

## Deploy

1. Vercel → Add New Project → import `AitelqadiMo/CineFolio` → Deploy (no settings needed).
2. Storage: Vercel dashboard → Storage → Create → **Upstash Redis** (free tier) →
   connect to this project. Env vars are injected automatically; redeploy.
   Until then the form still works and signups land in function logs.

## Reading signups

Upstash console → data browser: list `cinefolio:waitlist` (JSON entries, newest first),
set `cinefolio:emails` (dedupe). Or `LRANGE cinefolio:waitlist 0 -1` in the CLI.

## Demo

Cut Nº1: [aitelqadi.dev](https://www.aitelqadi.dev)

© 2026 Mohammed Ait El Qadi. All rights reserved.

## Funnel analytics (built in)

Daily counters in Redis: `cinefolio:hits:YYYY-MM-DD:{home|services|studio|contact}`.
Full funnel: page hits -> `cinefolio:orders` (studio runs) -> `cinefolio:waitlist` (signups) -> `cinefolio:contact`.
Read in Upstash console or CLI: `KEYS cinefolio:hits:*`, `LRANGE cinefolio:orders 0 -1`.
Also enable Vercel Analytics (project settings) for referrer data.

## Agent webhook

Set `AGENT_WEBHOOK_URL` in Vercel env to forward every Studio order (JSON: email, name, role, cvText) to the production agent. Fire-and-forget; the instant rough cut is served regardless.
