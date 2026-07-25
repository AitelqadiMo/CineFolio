// node --test: the vault-recovery moment. When a free-plan limited engagement
// ends, two things must happen honestly: the owner (the warmest buyer in the
// product, their live link just went dark in front of their own audience) hears
// about it once with the TRUE revive price and a one-click path, and a visitor
// to the dark slug sees an honest "not currently screening" page instead of a
// generic not-found. This suite pins both, plus the guarantees around them:
// exactly-once sends, fail-soft mail, a stale expiry stays silent, and the edge
// sentinel distinguishes a vaulted film from a slug that never existed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sweepTrials, expireTrialIfDue, notifyVaulted, VAULT_SENTINEL, VAULT_NOTIFY_WINDOW_HOURS } from "../sites.mjs";
import { filmVaultedEmail } from "../email.mjs";
import { FOUNDING_PRICE, CUT_PRICE, FOUNDING_SEATS } from "../lib.mjs";

// ---------- fakes (the in-memory ctx pattern from test/api.test.mjs) ----------
function fakeCtx(overrides = {}) {
  const store = new Map(); // "PK|SK" -> item
  const kv = (i) => `${i.PK}|${i.SK}`;
  const ddb = {
    async get(Key) { return store.get(`${Key.PK}|${Key.SK}`) || null; },
    async put(Item, condition) {
      if (condition === "attribute_not_exists(PK)" && store.has(kv(Item))) {
        throw Object.assign(new Error("exists"), { name: "ConditionalCheckFailedException" });
      }
      store.set(kv(Item), structuredClone(Item));
    },
    async update({ Key, UpdateExpression, ExpressionAttributeValues = {}, ExpressionAttributeNames = {}, ConditionExpression }) {
      const k = `${Key.PK}|${Key.SK}`;
      const item = store.get(k) || { ...Key };
      if (ConditionExpression === "attribute_exists(PK)" && !store.has(k)) {
        throw Object.assign(new Error("missing"), { name: "ConditionalCheckFailedException" });
      }
      // the exactly-once guards: the vault stamp and the final-screening stamp
      if (ConditionExpression === "attribute_exists(PK) AND attribute_not_exists(vaultedNotifiedAt)"
        && (!store.has(k) || item.vaultedNotifiedAt !== undefined)) {
        throw Object.assign(new Error("already vaulted-notified"), { name: "ConditionalCheckFailedException" });
      }
      if (ConditionExpression === "attribute_exists(PK) AND attribute_not_exists(trialWarnedAt)"
        && (!store.has(k) || item.trialWarnedAt !== undefined)) {
        throw Object.assign(new Error("already warned"), { name: "ConditionalCheckFailedException" });
      }
      const resolve = (n) => ExpressionAttributeNames[n] || n;
      for (const clause of UpdateExpression.split(/SET|ADD/).filter(Boolean).map((c) => c.trim())) {
        for (const part of clause.split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean)) {
          if (part.includes("=")) {
            const [lhs, rhs] = part.split("=").map((x) => x.trim());
            item[resolve(lhs)] = ExpressionAttributeValues[rhs];
          } else {
            const m = part.match(/^(\S+)\s+(:\S+)$/);
            if (m) item[resolve(m[1])] = (item[resolve(m[1])] || 0) + ExpressionAttributeValues[m[2]];
          }
        }
      }
      store.set(k, item);
      return item;
    },
    async del(Key) { store.delete(`${Key.PK}|${Key.SK}`); },
    async scan({ ExpressionAttributeValues: v }) {
      return { items: [...store.values()].filter((i) => i.type === v[":t"]), lastKey: null };
    },
    async query({ IndexName, ExpressionAttributeValues: v, KeyConditionExpression }) {
      const items = [...store.values()];
      if (IndexName === "GSI1") return items.filter((i) => i.GSI1PK === v[":p"] && (!v[":s"] || String(i.GSI1SK).startsWith(v[":s"])));
      if (KeyConditionExpression?.includes("begins_with")) return items.filter((i) => i.PK === v[":p"] && String(i.SK).startsWith(v[":s"]));
      return items.filter((i) => i.PK === v[":p"]);
    },
    _store: store,
  };
  const s3store = new Map();
  const ctx = {
    ddb,
    s3: {
      async deleteObject(b, k) { s3store.delete(`${b}/${k}`); },
      _store: s3store,
    },
    kvs: { puts: [], dels: [], async put(_a, k, val) { this.puts.push([k, val]); }, async del(_a, k) { this.dels.push(k); } },
    cdn: { invalidations: [], async invalidate(_d, p) { this.invalidations.push(p); } },
    ses: { sent: [], async send(from, to, subject, html, opts = {}) { this.sent.push({ from, to, subject, html, text: opts.text }); } },
    config: { appEnv: "test", appOrigin: "https://app.test", sesFrom: "studio@cinefolio.test", publishedBucket: "pub", distributionId: "DIST", kvsArn: "arn:kvs", cdnDomain: "cdn.test", sitesDomain: "cinefolio.dev" },
    ...overrides,
  };
  return ctx;
}

// a live free-plan AI premiere with the limited-engagement clock set
const mkSite = (ctx, id, extra = {}) => {
  const site = {
    PK: `SITE#${id}`, SK: "META", type: "site", siteId: id, slug: id, title: `Film ${id}`,
    status: "live", owner: `owner-${id}`, GSI1PK: `USER#owner-${id}`, releases: 1, orderId: `ord-${id}`,
    ...extra,
  };
  ctx.ddb._store.set(`SITE#${id}|META`, site);
  ctx.ddb._store.set(`SITE#${id}|RELEASE#00001`, { PK: `SITE#${id}`, SK: "RELEASE#00001", type: "release", n: 1, filePaths: ["index.html"] });
  return site;
};
const mkOwner = (ctx, id, email) => ctx.ddb._store.set(`USER#owner-${id}|PROFILE`, { PK: `USER#owner-${id}`, SK: "PROFILE", type: "user", email });
const justExpired = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();       // 5 min ago
const longExpired = () => "2020-01-01T00:00:00.000Z";                                 // years ago
const futureClock = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();

// ============================================================================
// the email builder: honest, true price, no shaming, no fake urgency
// ============================================================================

test("filmVaultedEmail: honest copy, real revive price, one-click CTA, zero shame", () => {
  const mail = filmVaultedEmail(
    { slug: "nadia", title: "Nadia's Film", url: "https://nadia.cinefolio.dev/", trialEndsAt: justExpired(), price: CUT_PRICE, foundingSeatsLeft: 0 },
    "https://app.test"
  );
  // honest framing: the run ended, nothing is lost, the address is held
  assert.match(mail.subject, /vault/i);
  assert.match(mail.html, /Nadia's Film/);
  assert.match(mail.html, /vault/i);
  assert.match(mail.html, /address stays reserved|address is still|address held/i);
  assert.match(mail.text, /Nothing is lost/i);
  // the true price is quoted and the CTA revives in one click, pointing at settings
  assert.match(mail.html, new RegExp(`\\$${CUT_PRICE}`));
  assert.match(mail.html, /https:\/\/app\.test\/settings/);
  assert.match(mail.html, /Bring it back/i);
  // studio-software voice: the app renders, YOU build it (never "we produce")
  assert.match(mail.html, /you build the film and the app renders it/i);
  assert.doesNotMatch(mail.html, /we (produce|make|build) your/i);
  // NEVER shame the owner, never fabricate scarcity
  assert.doesNotMatch(mail.html + mail.subject, /expired|failed|forgot|neglect|too late|hurry|act now|last chance/i);
  // a multipart plaintext part always rides along
  assert.ok(mail.text && mail.text.length > 0);
});

test("filmVaultedEmail: quotes the founding price and a true founding line only when seats are known to remain", () => {
  const withSeats = filmVaultedEmail(
    { slug: "s", title: "Founder Film", url: "https://s.cinefolio.dev/", trialEndsAt: justExpired(), price: FOUNDING_PRICE, foundingSeatsLeft: 7 },
    "https://app.test"
  );
  assert.match(withSeats.html, new RegExp(`\\$${FOUNDING_PRICE}`));
  assert.match(withSeats.html, /founding/i);
  assert.match(withSeats.html, /console shows/i); // defers the live count to the authority, no fake number

  // seats unknown/closed -> NO founding sentence at all (never invent scarcity),
  // and the standard price stands
  const noSeats = filmVaultedEmail(
    { slug: "s", title: "Late Film", url: "https://s.cinefolio.dev/", trialEndsAt: justExpired(), price: CUT_PRICE, foundingSeatsLeft: 0 },
    "https://app.test"
  );
  assert.doesNotMatch(noSeats.html, /founding/i);
  assert.match(noSeats.html, new RegExp(`\\$${CUT_PRICE}`));

  // the founding line never fabricates a seat count it was not given
  assert.doesNotMatch(withSeats.html, new RegExp(`${FOUNDING_SEATS} seats`));
});

test("filmVaultedEmail: no appOrigin -> no CTA, but the note still stands", () => {
  const mail = filmVaultedEmail({ slug: "x", title: "X", trialEndsAt: justExpired(), price: CUT_PRICE }, "");
  assert.doesNotMatch(mail.html, /href="\/settings"/);
  assert.match(mail.html, /vault/i);
});

// ============================================================================
// the hourly sweep: fires the vault call AT expiry, exactly once
// ============================================================================

test("sweep: a fresh expiry darkens AND sends the vault call once, stamped, and is reported", async () => {
  const ctx = fakeCtx();
  mkSite(ctx, "fresh1", { trialEndsAt: justExpired() });
  mkOwner(ctx, "fresh1", "owner@x.io");

  const r1 = await sweepTrials(ctx);
  assert.equal(r1.darkened, 1, "the marquee went dark");
  assert.equal(r1.vaulted, 1, "the vault call fired");
  const row = ctx.ddb._store.get("SITE#fresh1|META");
  assert.equal(row.status, "trial_ended", "vaulted, not taken down");
  assert.ok(row.vaultedNotifiedAt, "the send is stamped for exactly-once");
  assert.equal(ctx.ses.sent.length, 1);
  assert.match(ctx.ses.sent[0].to, /owner@x\.io/);
  assert.match(ctx.ses.sent[0].subject, /vault/i);
  // the vaulted slug points at the edge sentinel so a visitor gets the honest page
  assert.ok(ctx.kvs.dels.includes("fresh1"), "the live pointer was pulled");
  assert.ok(ctx.kvs.puts.some(([k, v]) => k === "fresh1" && v === VAULT_SENTINEL), "the vault sentinel was set");

  // a second sweep re-darkens nothing and NEVER double-sends
  const r2 = await sweepTrials(ctx);
  assert.equal(r2.darkened, 0);
  assert.equal(r2.vaulted, 0);
  assert.equal(ctx.ses.sent.length, 1, "one vault call, ever");
});

test("sweep: a long-past expiry (legacy backfill) darkens SILENTLY: no dishonest 'just went dark' note", async () => {
  const ctx = fakeCtx();
  mkSite(ctx, "old1", { trialEndsAt: longExpired() });
  mkOwner(ctx, "old1", "owner@x.io");

  const r = await sweepTrials(ctx);
  assert.equal(r.darkened, 1, "it still goes dark");
  assert.equal(r.vaulted, 0, "but no email for a years-old expiry");
  assert.equal(ctx.ses.sent.length, 0);
  assert.equal(ctx.ddb._store.get("SITE#old1|META").vaultedNotifiedAt ?? null, null, "no stamp for a silent darken");
  // it still gets the edge sentinel so the visitor page is honest
  assert.ok(ctx.kvs.puts.some(([k, v]) => k === "old1" && v === VAULT_SENTINEL));
});

test("sweep: the T-24 warning and the vault call are distinct moments, each fires once", async () => {
  const ctx = fakeCtx();
  mkSite(ctx, "expire1", { trialEndsAt: justExpired() });       // past end -> vault call
  mkSite(ctx, "warn1", { trialEndsAt: futureClock(10) });        // last day -> warning
  mkSite(ctx, "safe1", { trialEndsAt: futureClock(60) });        // outside horizon -> nothing
  mkOwner(ctx, "expire1", "a@x.io");
  mkOwner(ctx, "warn1", "b@x.io");
  mkOwner(ctx, "safe1", "c@x.io");

  const r = await sweepTrials(ctx);
  assert.equal(r.darkened, 1);
  assert.equal(r.vaulted, 1);
  assert.equal(r.warned, 1);
  assert.equal(ctx.ses.sent.length, 2, "one vault call + one final-screening call");
  const subjects = ctx.ses.sent.map((m) => m.subject).join(" | ");
  assert.match(subjects, /vault/i);
  assert.match(subjects, /Final screening/i);
  assert.equal(ctx.ddb._store.get("SITE#safe1|META").status, "live", "the safe film is untouched");
  assert.equal(ctx.ddb._store.get("SITE#safe1|META").vaultedNotifiedAt ?? null, null);
});

test("sweep: mail is fail-soft: a throw inside the vault call never breaks the darken", async () => {
  const ctx = fakeCtx();
  mkSite(ctx, "boom1", { trialEndsAt: justExpired() });
  mkOwner(ctx, "boom1", "owner@x.io");
  // make the vault call blow up AFTER the darken (the profile read throws hard):
  // notifyVaulted's own try/catch must absorb it so the sweep still completes.
  const realGet = ctx.ddb.get.bind(ctx.ddb);
  ctx.ddb.get = async (Key) => {
    if (Key.PK === "USER#owner-boom1") throw new Error("DDB unavailable");
    return realGet(Key);
  };

  const r = await sweepTrials(ctx); // must not throw
  assert.equal(r.darkened, 1, "the darken still lands");
  assert.equal(r.vaulted, 0, "a blown-up vault call does not count as vaulted");
  assert.equal(ctx.ses.sent.length, 0);
  assert.equal(ctx.ddb._store.get("SITE#boom1|META").status, "trial_ended", "the film is safely in the vault");
});

test("sweep: SES itself throttling is swallowed by sendEmail: the sweep never sees it", async () => {
  // sendEmail is the fail-soft boundary: a throwing transport is caught there,
  // so the stamp stands and the sweep completes cleanly (the send was attempted).
  const ctx = fakeCtx({
    ses: { sent: [], async send() { throw new Error("SES throttled"); } },
  });
  mkSite(ctx, "throttle1", { trialEndsAt: justExpired() });
  mkOwner(ctx, "throttle1", "owner@x.io");
  const r = await sweepTrials(ctx); // must not throw
  assert.equal(r.darkened, 1);
  assert.equal(ctx.ddb._store.get("SITE#throttle1|META").status, "trial_ended");
  assert.ok(ctx.ddb._store.get("SITE#throttle1|META").vaultedNotifiedAt, "stamped: we tried, so we never retry-storm");
});

test("sweep: an owner with no email on file darkens quietly and never blocks the sweep", async () => {
  const ctx = fakeCtx();
  mkSite(ctx, "noemail1", { trialEndsAt: justExpired() }); // no owner PROFILE row
  const r = await sweepTrials(ctx);
  assert.equal(r.darkened, 1);
  assert.equal(r.vaulted, 0);
  assert.equal(ctx.ses.sent.length, 0);
});

// ============================================================================
// the beacon path: a visit past the end darkens AND sends, once
// ============================================================================

test("beacon: expireTrialIfDue darkens on first look past the end and sends the vault call once", async () => {
  const ctx = fakeCtx();
  const site = mkSite(ctx, "beacon1", { trialEndsAt: justExpired() });
  mkOwner(ctx, "beacon1", "owner@x.io");

  const first = await expireTrialIfDue(ctx, site);
  assert.equal(first, true, "it expired");
  assert.equal(ctx.ddb._store.get("SITE#beacon1|META").status, "trial_ended");
  assert.equal(ctx.ses.sent.length, 1, "the owner heard about it");
  assert.match(ctx.ses.sent[0].subject, /vault/i);

  // the beacon and the sweep share one stamp: neither double-sends the other's work
  const stamped = ctx.ddb._store.get("SITE#beacon1|META");
  const swept = await sweepTrials(ctx);
  assert.equal(swept.vaulted, 0, "the sweep respects the beacon's stamp");
  assert.equal(ctx.ses.sent.length, 1, "still exactly one vault call");
  assert.ok(stamped.vaultedNotifiedAt);
});

test("beacon: a not-yet-expired engagement is left alone (no darken, no mail)", async () => {
  const ctx = fakeCtx();
  const site = mkSite(ctx, "live1", { trialEndsAt: futureClock(30) });
  mkOwner(ctx, "live1", "owner@x.io");
  const r = await expireTrialIfDue(ctx, site);
  assert.equal(r, false);
  assert.equal(ctx.ddb._store.get("SITE#live1|META").status, "live");
  assert.equal(ctx.ses.sent.length, 0);
});

// ============================================================================
// notifyVaulted directly: the exactly-once + true-price contract
// ============================================================================

test("notifyVaulted: reads the real founding counter and quotes the founding price while seats remain", async () => {
  const ctx = fakeCtx();
  const site = mkSite(ctx, "count1", { trialEndsAt: justExpired() });
  mkOwner(ctx, "count1", "owner@x.io");
  ctx.ddb._store.set("COUNTER|FOUNDING", { PK: "COUNTER", SK: "FOUNDING", count: 3 }); // seats remain

  const sent = await notifyVaulted(ctx, site);
  assert.equal(sent, true);
  assert.match(ctx.ses.sent[0].html, new RegExp(`\\$${FOUNDING_PRICE}`), "the true founding price is quoted");
  assert.match(ctx.ses.sent[0].html, /founding/i);
});

test("notifyVaulted: once the founding window is closed, it quotes the standard price and drops the founding line", async () => {
  const ctx = fakeCtx();
  const site = mkSite(ctx, "count2", { trialEndsAt: justExpired() });
  mkOwner(ctx, "count2", "owner@x.io");
  ctx.ddb._store.set("COUNTER|FOUNDING", { PK: "COUNTER", SK: "FOUNDING", count: FOUNDING_SEATS }); // sold out

  await notifyVaulted(ctx, site);
  assert.match(ctx.ses.sent[0].html, new RegExp(`\\$${CUT_PRICE}`));
  assert.doesNotMatch(ctx.ses.sent[0].html, /founding/i);
});

test("notifyVaulted: the stamp is the exactly-once guard even under a racing double call", async () => {
  const ctx = fakeCtx();
  const site = mkSite(ctx, "race1", { trialEndsAt: justExpired() });
  mkOwner(ctx, "race1", "owner@x.io");

  const [a, b] = await Promise.all([notifyVaulted(ctx, site), notifyVaulted(ctx, { ...site })]);
  assert.equal([a, b].filter(Boolean).length, 1, "exactly one of the racing calls sends");
  assert.equal(ctx.ses.sent.length, 1);
});

test("notifyVaulted: window boundary: outside VAULT_NOTIFY_WINDOW_HOURS is silent", async () => {
  const ctx = fakeCtx();
  const overWindow = new Date(Date.now() - (VAULT_NOTIFY_WINDOW_HOURS + 1) * 3600 * 1000).toISOString();
  const site = mkSite(ctx, "edge1", { trialEndsAt: overWindow });
  mkOwner(ctx, "edge1", "owner@x.io");
  assert.equal(await notifyVaulted(ctx, site), false);
  assert.equal(ctx.ses.sent.length, 0);
});

// ============================================================================
// the edge sentinel: vaulted vs never-existed vs owner takedown
// ============================================================================

test("darkenSite via sweep sets the vault sentinel for an expiry, and the router serves an honest vault page for it", async () => {
  // expiry path sets the sentinel (verified above); a takedown must NOT: the
  // owner pulled it on purpose, so it reads as never-published, no vault upsell.
  const ctx = fakeCtx();
  mkSite(ctx, "vault-edge", { trialEndsAt: justExpired() });
  mkOwner(ctx, "vault-edge", "owner@x.io");
  await sweepTrials(ctx);
  assert.ok(ctx.kvs.puts.some(([k, v]) => k === "vault-edge" && v === VAULT_SENTINEL), "expiry -> sentinel");

  // the router source recognizes the sentinel and returns a distinct, honest,
  // non-shaming page with a build-your-own path (validated as source text since
  // the CloudFront runtime module is not importable under node --test).
  const routerSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../hosting/functions/router.js"), "utf8");
  assert.match(routerSrc, /VAULT_SENTINEL\s*=\s*"_vault"/, "router agrees on the sentinel value");
  assert.match(routerSrc, /target === VAULT_SENTINEL/, "router branches on the sentinel");
  assert.match(routerSrc, /not currently screening/i, "vault page reads differently from a never-existed 404");
  assert.match(routerSrc, /build your own film/i, "vault page offers a clear path to build one");
  // the vault page never shames the owner and never fakes urgency
  assert.doesNotMatch(routerSrc, /expired|forgot|neglect|hurry|act now|last chance/i);
  // studio-software voice on the visitor page too: the app renders, you build it
  assert.match(routerSrc, /the app renders it/i);
  assert.doesNotMatch(routerSrc, /we (produce|make|build) your/i);
});
