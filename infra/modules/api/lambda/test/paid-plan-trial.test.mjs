// node --test: a PAID plan never loses its marquee to the free-tier clock.
//
// The engagement clock is a free-plan conversion mechanic. Publish sets it only
// when the owner has no paid plan, and publishing after an upgrade clears it.
// But the purchase webhook touches ONLY the profile, never site rows, so the
// archetypal first buyer (premieres free, watches the countdown, pays) still
// carried the old clock on their live film, and the hourly sweep or the view
// beacon would darken a PAYING customer's film 72 hours after they paid,
// recoverable only by a manual re-publish. These tests pin the heal: a paid
// owner's clock is cleared, the film stays live, and no pay-to-keep-it mail is
// ever sent to someone who already paid.
//
// Also pinned here: the final-screening (T-24h) email quotes the TRUE current
// price from the founding counter, exactly like the vault email does. It
// hardcoded $99 before, overstating 2x to the warmest founding-window prospect
// in the product.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sweepTrials, expireTrialIfDue, healPaidTrial } from "../sites.mjs";
import { trialWarningEmail } from "../email.mjs";
import { FOUNDING_PRICE, CUT_PRICE, FOUNDING_SEATS } from "../lib.mjs";

// ---------- fakes (the in-memory ctx pattern from test/vault.test.mjs) ----------
function fakeCtx() {
  const store = new Map(); // "PK|SK" -> item
  const ddb = {
    async get(Key) { return store.get(`${Key.PK}|${Key.SK}`) || null; },
    async update({ Key, UpdateExpression, ExpressionAttributeValues = {}, ExpressionAttributeNames = {}, ConditionExpression }) {
      const k = `${Key.PK}|${Key.SK}`;
      const item = store.get(k) || { ...Key };
      if (ConditionExpression === "attribute_exists(PK)" && !store.has(k)) {
        throw Object.assign(new Error("missing"), { name: "ConditionalCheckFailedException" });
      }
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
    async scan({ ExpressionAttributeValues: v }) {
      return { items: [...store.values()].filter((i) => i.type === v[":t"]), lastKey: null };
    },
    async query({ IndexName, ExpressionAttributeValues: v, KeyConditionExpression }) {
      const items = [...store.values()];
      if (IndexName === "GSI1") return items.filter((i) => i.GSI1PK === v[":p"] && (!v[":s"] || String(i.GSI1SK).startsWith(v[":s"])));
      if (KeyConditionExpression?.includes("begins_with")) return items.filter((i) => i.PK === v[":p"] && String(i.SK).startsWith(v[":s"]));
      return items.filter((i) => i.PK === v[":p"]);
    },
    async del(Key) { store.delete(`${Key.PK}|${Key.SK}`); },
    _store: store,
  };
  const s3store = new Map();
  return {
    ddb,
    s3: { async deleteObject(b, k) { s3store.delete(`${b}/${k}`); }, _store: s3store },
    kvs: { puts: [], async put(_a, k, val) { this.puts.push([k, val]); }, async del(_a, k) {} },
    cdn: { async invalidate() {} },
    ses: { sent: [], async send(from, to, subject, html, opts = {}) { this.sent.push({ from, to, subject, html, text: opts.text }); } },
    config: { appEnv: "test", appOrigin: "https://app.test", sesFrom: "studio@cinefolio.test", publishedBucket: "pub", distributionId: "DIST", kvsArn: "arn:kvs", cdnDomain: "cdn.test", sitesDomain: "cinefolio.dev" },
  };
}

const past = new Date(Date.now() - 3600 * 1000).toISOString();
const soon = new Date(Date.now() + 6 * 3600 * 1000).toISOString(); // inside the 24h warn horizon

function seedSite(ctx, id, extra = {}) {
  const site = {
    PK: `SITE#${id}`, SK: "META", type: "site", siteId: id, slug: id, title: `Film ${id}`,
    status: "live", owner: `owner-${id}`, GSI1PK: `USER#owner-${id}`, releases: 1, orderId: `ord-${id}`,
    ...extra,
  };
  ctx.ddb._store.set(`SITE#${id}|META`, site);
  return site;
}
function seedProfile(ctx, owner, extra = {}) {
  ctx.ddb._store.set(`USER#${owner}|PROFILE`, { PK: `USER#${owner}`, SK: "PROFILE", email: `${owner}@x.test`, ...extra });
}

test("the sweep never darkens a paid owner's film: the clock is healed, the film stays live", async () => {
  const ctx = fakeCtx();
  // the archetypal first buyer: premiered free (clock set), then bought the Cut
  seedSite(ctx, "paid1", { trialEndsAt: past });
  seedProfile(ctx, "owner-paid1", { plan: "director" });
  // a genuinely free owner's expired film in the SAME sweep still darkens
  seedSite(ctx, "free1", { trialEndsAt: past });
  seedProfile(ctx, "owner-free1", {});

  const out = await sweepTrials(ctx);

  const paid = ctx.ddb._store.get("SITE#paid1|META");
  assert.equal(paid.status, "live", "a paying customer's marquee never goes dark");
  assert.equal(paid.trialEndsAt ?? null, null, "the leftover clock is cleared for good");
  assert.equal(out.healed, 1, "the sweep reports the heal");

  const free = ctx.ddb._store.get("SITE#free1|META");
  assert.equal(free.status, "trial_ended", "the free-plan engagement still ends on time");
  assert.equal(out.darkened, 1);

  // and no vault email went to the paying customer
  const paidMail = ctx.ses.sent.filter((m) => m.to === "owner-paid1@x.test");
  assert.equal(paidMail.length, 0, "no vault or pay-to-revive mail to someone who already paid");
});

test("the view beacon never darkens a paid owner's film either", async () => {
  const ctx = fakeCtx();
  const site = seedSite(ctx, "paid2", { trialEndsAt: past });
  seedProfile(ctx, "owner-paid2", { plan: "coach" }); // legacy paid plan counts too

  const expired = await expireTrialIfDue(ctx, site);
  assert.equal(expired, false, "the beacon reports no expiry for a paid owner");
  const row = ctx.ddb._store.get("SITE#paid2|META");
  assert.equal(row.status, "live");
  assert.equal(row.trialEndsAt ?? null, null, "the beacon heals the clock too");

  // contrast: a free owner's film past its end darkens on the beacon
  const freeSite = seedSite(ctx, "free2", { trialEndsAt: past });
  seedProfile(ctx, "owner-free2", {});
  assert.equal(await expireTrialIfDue(ctx, freeSite), true);
  assert.equal(ctx.ddb._store.get("SITE#free2|META").status, "trial_ended");
});

test("healPaidTrial is a no-op for free owners and never throws on a missing profile", async () => {
  const ctx = fakeCtx();
  const site = seedSite(ctx, "free3", { trialEndsAt: past });
  seedProfile(ctx, "owner-free3", {});
  assert.equal(await healPaidTrial(ctx, site), false, "free plan: not healed");
  assert.equal(ctx.ddb._store.get("SITE#free3|META").trialEndsAt, past, "clock untouched");

  const orphan = seedSite(ctx, "orphan", { trialEndsAt: past, GSI1PK: "USER#ghost" });
  assert.equal(await healPaidTrial(ctx, orphan), false, "no profile row: not healed, no throw");
});

test("a paid owner inside the warn horizon gets NO final-screening email", async () => {
  const ctx = fakeCtx();
  seedSite(ctx, "paid3", { trialEndsAt: soon });
  seedProfile(ctx, "owner-paid3", { plan: "director" });

  const out = await sweepTrials(ctx);
  assert.equal(out.warned, 0, "nobody warned");
  assert.equal(out.healed, 1, "healed instead");
  assert.equal(ctx.ses.sent.length, 0, "no pay-to-keep-it mail to a paying customer");
  assert.equal(ctx.ddb._store.get("SITE#paid3|META").trialWarnedAt ?? null, null, "no warn stamp either");
});

test("the final-screening email quotes the TRUE founding price while seats remain", async () => {
  const ctx = fakeCtx();
  seedSite(ctx, "warn1", { trialEndsAt: soon });
  seedProfile(ctx, "owner-warn1", {});
  // no COUNTER row at all: zero sold, the founding window is open

  const out = await sweepTrials(ctx);
  assert.equal(out.warned, 1);
  const mail = ctx.ses.sent[0];
  assert.match(mail.subject, /Final screening/i);
  assert.ok(mail.html.includes(`$${FOUNDING_PRICE}`), `quotes the founding price $${FOUNDING_PRICE}`);
  assert.ok(!mail.html.includes(`$${CUT_PRICE}`), "never quotes the standard price while the window is open");
  assert.match(mail.html, /Founding members pay/i, "carries the true founding line");
});

test("the final-screening email quotes the standard price once the founding window closes", async () => {
  const ctx = fakeCtx();
  seedSite(ctx, "warn2", { trialEndsAt: soon });
  seedProfile(ctx, "owner-warn2", {});
  // every founding seat sold: the counter is at the cap
  ctx.ddb._store.set("COUNTER|FOUNDING", { PK: "COUNTER", SK: "FOUNDING", count: FOUNDING_SEATS });

  const out = await sweepTrials(ctx);
  assert.equal(out.warned, 1);
  const mail = ctx.ses.sent[0];
  assert.ok(mail.html.includes(`$${CUT_PRICE}`), `quotes the standard price $${CUT_PRICE}`);
  assert.ok(!mail.html.includes(`$${FOUNDING_PRICE}`), "no stale founding price after the window");
  assert.ok(!/Founding members pay/i.test(mail.html), "no invented scarcity after the window");
});

test("trialWarningEmail builder: safe fallback when the caller passes no price", () => {
  const mail = trialWarningEmail({ title: "X", slug: "x", trialEndsAt: soon }, "https://app.test");
  assert.ok(mail.subject.length > 0);
  // the fallback is the standard price, never a made-up discount
  assert.ok(JSON.stringify(mail).includes("$99"), "falls back to the standard $99");
  assert.ok(!/Founding members pay/i.test(JSON.stringify(mail)), "no founding line without a seat count");
});
