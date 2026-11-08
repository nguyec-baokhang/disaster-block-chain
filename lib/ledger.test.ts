import assert from "node:assert/strict";
import { test } from "node:test";
import { filterChecks, parseLedgerFilters, redact, toLedgerEntry } from "./ledger";
import { RateLimiter } from "./rate-limit";
import type { CheckResult } from "./types";

function check(id: string, createdAt: string, extra: Partial<CheckResult> = {}): CheckResult {
  return {
    id,
    inputType: "text",
    inputText: `message ${id}`,
    verdict: "UNVERIFIED",
    basis: "none",
    summary: "summary",
    differences: [],
    sources: [],
    redFlags: [],
    limitations: [],
    createdAt,
    ...extra,
  };
}

const OWNER = { userId: "auth0|abc123", userEmail: "alice@example.com" };
const EMAILISH = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

test("ledger entries never expose emails or user ids", async (t) => {
  const checks = [
    check("CK-001", "2026-11-08T01:00:00.000Z", OWNER),
    check("CK-002", "2026-11-08T02:00:00.000Z", { ...OWNER, inputText: "Forwarded from bob.smith@gmail.com: EVACUATE NOW, call 513-555-0142" }),
    check("CK-003", "2026-11-08T03:00:00.000Z", {
      ...OWNER,
      inputType: "image",
      inputText: undefined,
      extractedText: "- - Contact ops@county.gov for water.\nSHOWN AS FROM: alice@example.com",
    }),
    check("CK-004", "2026-11-08T04:00:00.000Z", {
      ...OWNER,
      inputType: "link",
      inputText: undefined,
      sourceUrl: "https://news.example.com/story",
      sourceTitle: "Boil order lifted",
    }),
  ];

  for (const c of checks) {
    await t.test(`${c.id} (${c.inputType})`, () => {
      const entry = toLedgerEntry(c);
      assert.deepEqual(Object.keys(entry).sort(), ["createdAt", "id", "inputType", "preview", "verdict"]); // no owner fields
      const json = JSON.stringify(entry);
      assert.equal(EMAILISH.test(json), false, `no email in ${json}`);
      assert.equal(json.includes(OWNER.userId), false);
    });
  }

  await t.test("redacts pasted contact details but keeps the claim", () => {
    assert.equal(toLedgerEntry(checks[1]).preview, "Forwarded from [email]: EVACUATE NOW, call [phone]");
  });
  await t.test("tidies screenshot claims and drops the 'shown as from' line", () => {
    assert.equal(toLedgerEntry(checks[2]).preview, "Contact [email] for water.");
  });
  await t.test("links show the page title and host", () => {
    assert.equal(toLedgerEntry(checks[3]).preview, "Boil order lifted (news.example.com)");
  });
});

test("redact", async (t) => {
  const testCases = [
    { input: "mail a.b+c@x.co.uk now", want: "mail [email] now" },
    { input: "call (513) 555-0142 or +1 513.555.0142", want: "call [phone] or [phone]" },
    { input: "Shelter opens at 9 PM on Nov 8, 2026; 3 shelters, 120 beds", want: "Shelter opens at 9 PM on Nov 8, 2026; 3 shelters, 120 beds" },
  ];
  for (const tc of testCases) await t.test(tc.input, () => assert.equal(redact(tc.input), tc.want));
});

test("parseLedgerFilters only accepts known values", async (t) => {
  const testCases = [
    { name: "both", params: { verdict: "CONTRADICTED", type: "image" }, want: { verdict: "CONTRADICTED", type: "image" } },
    { name: "unknown verdict ignored", params: { verdict: "FAKE'; DROP TABLE checks;--" }, want: {} },
    { name: "array takes the first", params: { type: ["link", "video"] }, want: { type: "link" } },
    { name: "none", params: {}, want: {} },
  ];
  for (const tc of testCases) await t.test(tc.name, () => assert.deepEqual(parseLedgerFilters(tc.params), tc.want));
});

test("filterChecks: newest first, filtered, limited", () => {
  const checks = [
    check("CK-001", "2026-11-08T01:00:00.000Z", { verdict: "CONTRADICTED" }),
    check("CK-002", "2026-11-08T02:00:00.000Z", { verdict: "CONTRADICTED", inputType: "image" }),
    check("CK-003", "2026-11-08T03:00:00.000Z"),
    check("CK-004", "2026-11-08T04:00:00.000Z", { verdict: "CONTRADICTED" }),
  ];
  assert.deepEqual(filterChecks(checks, {}).map((c) => c.id), ["CK-004", "CK-003", "CK-002", "CK-001"]);
  assert.deepEqual(filterChecks(checks, { verdict: "CONTRADICTED" }).map((c) => c.id), ["CK-004", "CK-002", "CK-001"]);
  assert.deepEqual(filterChecks(checks, { verdict: "CONTRADICTED", type: "text" }).map((c) => c.id), ["CK-004", "CK-001"]);
  assert.deepEqual(filterChecks(checks, {}, 2).map((c) => c.id), ["CK-004", "CK-003"]);
});

test("RateLimiter: 10 per minute per user", async (t) => {
  const t0 = Date.parse("2026-11-08T06:00:00.000Z");
  const limiter = new RateLimiter(10, 60_000);

  await t.test("allows 10, blocks the 11th with a retry-after", () => {
    for (let i = 0; i < 10; i++) assert.equal(limiter.hit("auth0|alice", t0 + i * 1000).ok, true);
    const blocked = limiter.hit("auth0|alice", t0 + 10_000);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.retryAfterSec, 50);
  });
  await t.test("other users are unaffected", () => assert.equal(limiter.hit("auth0|bob", t0 + 10_000).ok, true));
  await t.test("frees up as the window slides", () => assert.equal(limiter.hit("auth0|alice", t0 + 60_001).ok, true));
});
