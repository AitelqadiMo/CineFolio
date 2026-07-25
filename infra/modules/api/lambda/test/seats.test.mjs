// node --test: GET /seats, the landing's public founding-counter read.
//
// The Plans page shipped with a static "FOUNDING SEATS ARE LIMITED TO 20" line
// and an explicit wire-me-before-launch comment. This endpoint completes the
// honesty loop: the marketing page reads the REAL remaining count through the
// same shared reader (foundingSeatsLeft) that checkout, /me, and both order
// responses use, so the landing can never quote a seat count or price the
// register would disagree with. These tests pin the three states that matter:
// seats remaining, cohort full, and a degraded counter read (unknown, never
// fabricated), plus the public cacheability that keeps a landing-page burst
// off the table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getSeats } from "../billing.mjs";
import { FOUNDING_SEATS, FOUNDING_PRICE, CUT_PRICE } from "../lib.mjs";

const ctxWith = (counterRow, { throws = false } = {}) => ({
  ddb: {
    async get(Key) {
      if (throws) throw new Error("DDB unavailable");
      if (Key.PK === "COUNTER" && Key.SK === "FOUNDING") return counterRow;
      return null;
    },
  },
});

const bodyOf = (r) => JSON.parse(r.body);

test("seats: no counter row means zero sold, the full cohort is open at the founding price", async () => {
  const r = await getSeats({}, ctxWith(null));
  assert.equal(r.statusCode, 200);
  const b = bodyOf(r);
  assert.equal(b.ok, true);
  assert.equal(b.seatsLeft, FOUNDING_SEATS, "a missing row means zero founding purchases");
  assert.equal(b.seatsTotal, FOUNDING_SEATS);
  assert.equal(b.price, FOUNDING_PRICE, "the live price is the founding price while seats remain");
  assert.equal(b.foundingPrice, FOUNDING_PRICE);
  assert.equal(b.cutPrice, CUT_PRICE);
});

test("seats: a partly sold cohort reports the real remaining count", async () => {
  const r = await getSeats({}, ctxWith({ PK: "COUNTER", SK: "FOUNDING", count: 7 }));
  const b = bodyOf(r);
  assert.equal(b.seatsLeft, FOUNDING_SEATS - 7);
  assert.equal(b.price, FOUNDING_PRICE);
});

test("seats: a full cohort steps the live price to the standard price", async () => {
  const r = await getSeats({}, ctxWith({ PK: "COUNTER", SK: "FOUNDING", count: FOUNDING_SEATS }));
  const b = bodyOf(r);
  assert.equal(b.seatsLeft, 0);
  assert.equal(b.price, CUT_PRICE, "no founding seats means the standard price is the live price");
  // an oversold counter (the webhook has no cap yet) still reads as zero, never negative
  const over = bodyOf(await getSeats({}, ctxWith({ PK: "COUNTER", SK: "FOUNDING", count: FOUNDING_SEATS + 3 })));
  assert.equal(over.seatsLeft, 0, "seats-left is floored at zero");
});

test("seats: a degraded counter read returns null (unknown), never a fabricated number", async () => {
  const r = await getSeats({}, ctxWith(null, { throws: true }));
  assert.equal(r.statusCode, 200, "a read blip never breaks the landing");
  const b = bodyOf(r);
  assert.equal(b.seatsLeft, null, "unknown is null, the client keeps its static honest copy");
  assert.equal(b.price, FOUNDING_PRICE, "the founding window is held open on a degraded read, same as checkout");
});

test("seats: the response is publicly cacheable with a short max-age, not no-store", async () => {
  const r = await getSeats({}, ctxWith(null));
  const cc = (r.headers || {})["Cache-Control"] || (r.headers || {})["cache-control"] || "";
  assert.match(String(cc), /public/i, "a public read must be edge-cacheable");
  assert.match(String(cc), /max-age=\d+/i);
  assert.doesNotMatch(String(cc), /no-store/i);
});
