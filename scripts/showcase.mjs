#!/usr/bin/env node
// scripts/showcase.mjs: the operator's showcase-consent tool.
//
// ============================================================================
//  CONSENT MUST BE OBTAINED FROM THE OWNER BEFORE SETTING THE FLAG.
//
//  A film appears on the public wall at /showcase only when its owner opted in
//  (showcase === true) AND it is live. This tool exists so an operator can
//  RECORD a consent the owner has ALREADY GIVEN (over email, a call, a signed
//  reply). It is never a way to decide for them. Do not set the flag on a
//  customer's film unless that customer told you, in their own words, that they
//  want their portfolio shown in the public gallery. Consent is reversible: an
//  owner can flip it off themselves from their console, and so can this tool
//  with `clear`. When in doubt, ask the owner first, then run this.
// ============================================================================
//
// WHAT IT DOES
//   list            Read-only. Lists every LIVE film with its slug, title,
//                   owner email, and current showcase state, so the operator
//                   knows exactly whose consent to ask for. (Also shows a short
//                   tail of non-live films so a slug typo is obvious.)
//   set   <slug>    Turn a film's showcase flag ON  (requires the film be LIVE).
//   clear <slug>    Turn a film's showcase flag OFF (works in any status).
//
// SAFETY
//   - DRY RUN BY DEFAULT. `set` and `clear` only PREVIEW the change and print
//     what they WOULD do. Nothing is written unless you pass --write. This
//     touches real customer records, so the write is opt-in every single time.
//   - `set` refuses a film that is not live and writes nothing: the public read
//     rule (showcase === true AND status === "live") would hide it anyway, so
//     storing a true flag on a draft would be a silent lie. Premiere first.
//   - Every run prints exactly what it saw and exactly what it changed (the
//     before -> after of the flag), and never more than that.
//
// HOW THE TABLE IS REACHED (mirrors infra/modules/api/lambda/aws.mjs)
//   Same SDK the API already depends on: @aws-sdk/client-dynamodb +
//   @aws-sdk/lib-dynamodb, DynamoDBDocumentClient. Same region default
//   (AWS_REGION or eu-central-1). Same single table read from TABLE_NAME.
//   Site rows and owner emails are read the same way admin.mjs reads them:
//   a type-filtered scan for "site" items, then USER#{sub}/PROFILE for the
//   email. The write is byte-for-byte the UpdateExpression that the owner's own
//   POST /sites/{id}/showcase handler issues (showcase + updatedAt, guarded by
//   attribute_exists(PK)), so a film flagged here is indistinguishable from one
//   the owner flagged in the console.
//
// TABLE NAME
//   TABLE_NAME wins (exactly as the Lambda reads it). If it is unset, the tool
//   derives cinefolio-{env}-app from CINEFOLIO_ENV / APP_ENV / ENV (the
//   contract's naming in docs/contracts.md, e.g. cinefolio-prod-app). It never
//   guesses silently: it prints which table it is about to touch and refuses to
//   run without one.
//
// USAGE
//   node scripts/showcase.mjs list
//   node scripts/showcase.mjs list --all           # include non-live films too
//   node scripts/showcase.mjs set   <slug>         # dry run: shows the plan
//   node scripts/showcase.mjs set   <slug> --write # actually opt the film in
//   node scripts/showcase.mjs clear <slug>         # dry run: shows the plan
//   node scripts/showcase.mjs clear <slug> --write # actually opt the film out
//   node scripts/showcase.mjs status <slug>        # one film's current state
//
// ENV
//   TABLE_NAME        the DynamoDB table (preferred; matches the Lambda)
//   CINEFOLIO_ENV     used to build cinefolio-{env}-app when TABLE_NAME is unset
//   AWS_REGION        defaults to eu-central-1 (same default as aws.mjs)
//   Standard AWS credential resolution applies (profile, env, SSO, role).
//
// EXIT CODES
//   0 success (including a clean dry run)   1 usage / not-found / refused
//   2 environment or AWS error

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

// ---- tiny, dependency-free arg + tty helpers --------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));
const [command, slugArg] = positional;
const WRITE = flags.has("--write");
const SHOW_ALL = flags.has("--all");

const isTTY = process.stdout.isTTY;
const paint = (code, s) => (isTTY ? `[${code}m${s}[0m` : s);
const bold = (s) => paint("1", s);
const dim = (s) => paint("2", s);
const green = (s) => paint("32", s);
const yellow = (s) => paint("33", s);
const red = (s) => paint("31", s);

function die(msg, code = 1) {
  console.error(red(`✖ ${msg}`));
  process.exit(code);
}

// ---- table name + client (mirrors aws.mjs) ----------------------------------
function resolveTableName() {
  if (process.env.TABLE_NAME) return process.env.TABLE_NAME;
  const env = process.env.CINEFOLIO_ENV || process.env.APP_ENV || process.env.ENV;
  if (env) return `cinefolio-${env}-app`;
  return null;
}

const region = process.env.AWS_REGION || "eu-central-1";
const TABLE = resolveTableName();
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

// ---- data access: the same reads admin.mjs / showcase.mjs use ---------------
// Paginated, type-filtered scan for "site" rows. Correct at demand-test scale
// (hundreds of rows); the API notes the same tradeoff and the same GSI exit.
async function scanSites(cap = 5000) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await doc.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "#t = :t",
        ExpressionAttributeNames: { "#t": "type" },
        ExpressionAttributeValues: { ":t": "site" },
        ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
      })
    );
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < cap);
  return items;
}

// owner email lives on USER#{sub}/PROFILE, exactly like admin.sites() resolves it
async function emailFor(ownerSub) {
  if (!ownerSub) return null;
  const r = await doc.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${ownerSub}`, SK: "PROFILE" } })
  );
  return r.Item?.email || null;
}

// map a raw site row to only the operator-relevant, non-secret facts
function siteView(s) {
  return {
    slug: s.slug,
    title: s.title || s.slug,
    status: s.status || "unknown",
    owner: s.owner || null,
    showcase: s.showcase === true, // strict: mirror isShowcased's boolean rule
    live: s.status === "live",
    // keys needed for a precise, race-free write on exactly this row
    PK: s.PK,
    SK: s.SK,
    siteId: s.siteId || (s.PK ? String(s.PK).slice("SITE#".length) : null),
  };
}

async function loadSites() {
  const rows = (await scanSites()).map(siteView);
  // resolve emails once per distinct owner (same shape as admin.mjs)
  const owners = [...new Set(rows.map((r) => r.owner).filter(Boolean))];
  const emails = Object.fromEntries(
    await Promise.all(owners.map(async (o) => [o, await emailFor(o)]))
  );
  for (const r of rows) r.ownerEmail = emails[r.owner] || null;
  rows.sort((a, b) => a.slug.localeCompare(b.slug));
  return rows;
}

function findBySlug(rows, slug) {
  return rows.find((r) => r.slug === slug) || null;
}

const onOff = (b) => (b ? green("ON ") : dim("off"));
const statusTag = (s) =>
  s.live ? green("live") : yellow((s.status || "unknown").padEnd(4).slice(0, 12));

// ---- commands ---------------------------------------------------------------
function printTable(rows, title) {
  if (rows.length === 0) {
    console.log(dim(`  (none)`));
    return;
  }
  const slugW = Math.max(4, ...rows.map((r) => r.slug.length));
  const titleW = Math.min(28, Math.max(5, ...rows.map((r) => r.title.length)));
  console.log(
    dim(
      "  " +
        "SHOWCASE".padEnd(9) +
        "STATUS".padEnd(8) +
        "SLUG".padEnd(slugW + 2) +
        "TITLE".padEnd(titleW + 2) +
        "OWNER EMAIL"
    )
  );
  for (const r of rows) {
    const t = r.title.length > titleW ? r.title.slice(0, titleW - 1) + "…" : r.title;
    console.log(
      "  " +
        onOff(r.showcase).padEnd(9 + (isTTY ? 9 : 0)) +
        statusTag(r).padEnd(8 + (isTTY ? 9 : 0)) +
        bold(r.slug).padEnd(slugW + 2 + (isTTY ? 8 : 0)) +
        t.padEnd(titleW + 2) +
        (r.ownerEmail || dim("(no email on file)"))
    );
  }
}

async function cmdList() {
  const rows = await loadSites();
  const live = rows.filter((r) => r.live);
  const shown = live.filter((r) => r.showcase);

  console.log(bold(`\nCineFolio showcase: candidate films`));
  console.log(dim(`table: ${TABLE}  ·  region: ${region}\n`));

  console.log(bold(`Live films (${live.length}). These are the ones you may ask to showcase:`));
  printTable(live, "live");

  console.log(
    "\n" +
      dim(
        `On the public wall right now: ${shown.length} of ${live.length} live films ` +
          `(showcase = ON and live).`
      )
  );

  if (SHOW_ALL) {
    const other = rows.filter((r) => !r.live);
    console.log(bold(`\nNot live (${other.length}). Cannot be showcased until they premiere:`));
    printTable(other, "other");
  } else {
    const otherCount = rows.length - live.length;
    if (otherCount > 0) {
      console.log(dim(`\n${otherCount} non-live film(s) hidden. Pass --all to see them.`));
    }
  }

  console.log(
    "\n" +
      dim(
        "Remember: get the owner's consent first, then record it with " +
          "`set <slug> --write`.\n"
      )
  );
}

async function cmdStatus(slug) {
  const rows = await loadSites();
  const s = findBySlug(rows, slug);
  if (!s) die(`no film with slug "${slug}" (run \`list\` to see slugs)`);
  console.log(bold(`\n${s.slug}`) + dim(`  (${TABLE})`));
  console.log(`  title:    ${s.title}`);
  console.log(`  status:   ${statusTag(s)}${s.live ? "" : dim("  (not showable until live)")}`);
  console.log(`  owner:    ${s.ownerEmail || dim("(no email on file)")}`);
  console.log(`  showcase: ${onOff(s.showcase)}  ${dim(s.showcase ? "(on the public wall)" : "(hidden)")}\n`);
}

// the one write, shaped exactly like POST /sites/{id}/showcase in showcase.mjs
async function writeFlag(site, value) {
  await doc.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: site.PK, SK: site.SK },
      UpdateExpression: "SET showcase = :v, updatedAt = :t",
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeValues: { ":v": value, ":t": new Date().toISOString() },
    })
  );
}

async function cmdSetClear(slug, value) {
  const verb = value ? "set" : "clear";
  const rows = await loadSites();
  const s = findBySlug(rows, slug);
  if (!s) die(`no film with slug "${slug}" (run \`list\` to see slugs)`);

  console.log(bold(`\n${verb} showcase → ${value ? "ON" : "OFF"}  ·  ${s.slug}`));
  console.log(dim(`table: ${TABLE}  ·  owner: ${s.ownerEmail || "(no email on file)"}\n`));

  // refuse to opt a non-live film IN: the read rule would ignore it anyway.
  if (value === true && !s.live) {
    die(
      `"${slug}" is ${s.status}, not live. A non-live film cannot be showcased ` +
        `(the public wall shows only live, opted-in films). Premiere it first, then set the flag.`
    );
  }

  if (s.showcase === value) {
    console.log(
      yellow(`• already ${value ? "ON" : "off"}, nothing to change.`) +
        "  " +
        dim(`(showcase is already ${value})`) +
        "\n"
    );
    return;
  }

  const line = `${s.slug}: showcase ${onOff(s.showcase)} → ${onOff(value)}`;

  if (!WRITE) {
    console.log(yellow("DRY RUN") + dim(": no write performed. This is what --write would do:"));
    console.log("  " + line);
    console.log(
      "\n" +
        dim("Confirm the owner consented, then re-run with ") +
        bold("--write") +
        dim(" to apply.\n")
    );
    return;
  }

  // real write
  if (value === true) {
    console.log(
      dim(
        "Writing consent the OWNER gave. If they did not ask for this, stop now (Ctrl-C).\n"
      )
    );
  }
  try {
    await writeFlag(s, value);
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") {
      die(`the film row for "${slug}" vanished mid-write; re-run \`list\` and try again`, 2);
    }
    die(`write failed: ${e?.message || e}`, 2);
  }
  console.log(green("✔ CHANGED") + "  " + line);
  console.log(
    dim(
      value
        ? `"${s.slug}" is now on the public wall (it is live and opted in).\n`
        : `"${s.slug}" has been removed from the public wall.\n`
    )
  );
}

// ---- entry ------------------------------------------------------------------
function usage() {
  console.log(`CineFolio showcase operator tool

  node scripts/showcase.mjs list [--all]        list live films + consent state
  node scripts/showcase.mjs status <slug>       one film's current state
  node scripts/showcase.mjs set   <slug> [--write]   opt a LIVE film in
  node scripts/showcase.mjs clear <slug> [--write]   opt any film out

Dry run by default. Pass --write to actually change a real customer record.
CONSENT MUST BE OBTAINED FROM THE OWNER BEFORE SETTING THE FLAG.`);
}

async function main() {
  if (!command || flags.has("--help") || command === "help") {
    usage();
    process.exit(command ? 0 : 1);
  }
  if (!TABLE) {
    die(
      "no table name. Set TABLE_NAME (as the Lambda does), or CINEFOLIO_ENV to " +
        "build cinefolio-{env}-app.",
      2
    );
  }

  try {
    if (command === "list") return await cmdList();
    if (command === "status") {
      if (!slugArg) die("usage: status <slug>");
      return await cmdStatus(slugArg);
    }
    if (command === "set") {
      if (!slugArg) die("usage: set <slug> [--write]");
      return await cmdSetClear(slugArg, true);
    }
    if (command === "clear") {
      if (!slugArg) die("usage: clear <slug> [--write]");
      return await cmdSetClear(slugArg, false);
    }
    usage();
    process.exit(1);
  } catch (e) {
    // network / auth / permissions land here
    die(`AWS error: ${e?.name || ""} ${e?.message || e}`.trim(), 2);
  }
}

// Run only when invoked directly (node scripts/showcase.mjs ...). Importing the
// file (e.g. from a test) exposes the pure helpers below without side effects.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// exported for unit testing the data-shaping and the table-name resolution;
// the operator never needs these.
export { resolveTableName, siteView, doc, TABLE };
