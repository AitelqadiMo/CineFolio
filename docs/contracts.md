# CineFolio Contracts (v1) — API, Data, Events

The reference every module codes against. Change this file first, code second.

## API surface (HTTP API, JWT = Cognito authorizer)

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | public | liveness + env |
| `POST /waitlist` `{email}` | public | idempotent join (honeypot: `company`) |
| `GET /waitlist/count` | public | O(1) counter |
| `POST /contact` `{name,email,message}` | public | message intake |
| `POST /hit` `{page}` | public | daily per-page counter |
| `POST /studio/generate` `{email,name,role,cvText}` | public (dev) | create order, fire agent webhook, return rough-cut HTML. JWT required for paid orders at GA |
| `GET /studio/status?orderId` | public | `queued → ready \| dispatch_failed` |
| `GET /studio/cut?orderId` | public | director's-cut HTML (from S3) |
| `POST /callback` (raw HTML body) | `X-CF-Secret` header | agent delivers the cut. `X-CF-Order` header carries orderId |
| `GET /me` / `PUT /me` | JWT | profile, lazy-upserted on first call |
| `POST /sites` `{slug?,title?,orderId?}` | JWT | create site, claims slug (409 on conflict) |
| `GET /sites` / `GET /sites/{id}` | JWT | my sites / site + last 10 releases |
| `POST /sites/{id}/publish` `{html \| orderId}` | JWT owner/admin | new immutable release + pointer flip |
| `POST /sites/{id}/rollback` `{to?}` | JWT owner/admin | pointer flip to earlier release |
| `DELETE /sites/{id}` | JWT owner/admin | takedown (pointer removed, releases kept) |
| `GET /admin/orders?status=` | JWT + `admin` group | order queue (GSI2) |

Error shape: `{ ok:false, error:string }`. 4xx are actionable, 500 is opaque (`internal_error`).

## DynamoDB single-table (`cinefolio-{env}-app`)

| Entity | PK | SK | GSI1PK / GSI1SK | GSI2PK / GSI2SK |
|---|---|---|---|---|
| User profile | `USER#{sub}` | `PROFILE` | — | — |
| Waitlist entry | `WAITLIST#{email}` | `ENTRY` | `WAITLIST` / ts | — |
| Waitlist counter | `COUNTER` | `WAITLIST` | — | — |
| Contact msg | `CONTACT#{id}` | `MSG` | `CONTACT` / ts | — |
| Hit counter | `HIT#{date}` | `{page}` | `HIT` / `{date}#{page}` | — |
| Order | `ORDER#{orderId}` | `META` | `USER#{sub}` / `ORDER#{ts}` | `STATUS#{status}` / ts |
| Site | `SITE#{siteId}` | `META` | `USER#{sub}` / `SITE#{ts}` | — |
| Slug claim | `SLUG#{slug}` | `CLAIM` | `SLUG#{slug}` / `SITE` | — |
| Release | `SITE#{siteId}` | `RELEASE#{00n}` | — | — |
| Entitlement (P4) | `USER#{sub}` | `ENT#{product}` | `LSEVENT#{event_id}` / ts | — |

Idempotency rules: order create + waitlist join + slug claim = conditional put
(`attribute_not_exists(PK)`); publish = optimistic lock on `releases = :prev`;
LS webhooks (P4) dedupe on `LSEVENT#{event_id}`.

## Hosting pointer contract

- Bundle: `s3://published/sites/{siteId}/releases/{n}/index.html` (immutable, versioned bucket)
- Pointer: CloudFront KVS `slug -> "{siteId}/releases/{n}"` (atomic flip; no invalidation)
- Router KVS miss: serves `/sites/{slug}/...` directly (`_demo`, legacy, s3copy fallback)
- Fallback pointer (KVS data plane unavailable): copy release to `sites/{slug}/index.html` + targeted invalidation; `pointerMode` on the site record reports which mode is active
- Rollback: flip pointer to any retained release. Takedown: delete pointer, keep releases.

## Agent webhook contract (production pipeline, P3 = task token)

Request to `AGENT_WEBHOOK_URL` (Bearer `AGENT_WEBHOOK_SECRET`):
```json
{ "kind":"cinefolio.order", "orderId":"…", "email":"…", "name":"…", "role":"…",
  "skills":["…"], "cvText":"…", "instructions":"…",
  "deliver": { "method":"POST", "url":"https://{api}/callback",
               "headers": { "X-CF-Secret":"…", "X-CF-Order":"{orderId}", "content-type":"text/html" } } }
```
Delivery: raw HTML document (`<!doctype html` first, ≤900KB) to `deliver.url`.
P3 swap: `deliver` gains `taskToken`; Step Functions `waitForTaskToken` replaces polling.

## Secrets (SSM, path `/cinefolio/{env}/`)

`AGENT_WEBHOOK_URL`, `AGENT_WEBHOOK_SECRET`, `CF_CALLBACK_SECRET` — SecureString,
read once per Lambda container. Missing secrets = degraded mode (rough cut only,
`production:false`), never an error.
