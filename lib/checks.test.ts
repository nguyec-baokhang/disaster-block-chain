import assert from "node:assert/strict";
import { test } from "node:test";
import { checksForUser, ownerFields, publicCheck } from "./checks";
import type { CheckResult } from "./types";

const ALICE = "auth0|alice";
const BOB = "google-oauth2|bob";

function check(id: string, createdAt: string, owner: Partial<CheckResult> = {}): CheckResult {
  return {
    id,
    inputType: "text",
    inputText: `message ${id}`,
    verdict: "UNVERIFIED",
    basis: "none",
    summary: "",
    differences: [],
    sources: [],
    redFlags: [],
    limitations: [],
    createdAt,
    ...owner,
  };
}

const checks = [
  check("CK-001", "2026-11-08T01:00:00.000Z", { userId: ALICE, userEmail: "alice@example.com" }),
  check("CK-002", "2026-11-08T02:00:00.000Z", { userId: BOB, userEmail: "bob@example.com" }),
  check("CK-003", "2026-11-08T03:00:00.000Z"), // anonymous
  check("CK-004", "2026-11-08T04:00:00.000Z", { userId: ALICE, userEmail: "alice@example.com" }),
];

test("checksForUser", async (t) => {
  const testCases = [
    { name: "a user sees only their own checks, newest first", userId: ALICE, want: ["CK-004", "CK-001"] },
    { name: "another user sees only theirs", userId: BOB, want: ["CK-002"] },
    { name: "a user with no checks sees none", userId: "auth0|carol", want: [] },
    { name: "an empty user id never matches anonymous checks", userId: "", want: [] },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.deepEqual(checksForUser(checks, tc.userId).map((c) => c.id), tc.want));
  }
});

test("ownerFields", async (t) => {
  const testCases = [
    { name: "no login → anonymous check, no owner fields", user: null, want: {} },
    { name: "session without a sub → anonymous", user: { email: "x@example.com" }, want: {} },
    { name: "logged in → sub and email", user: { sub: ALICE, email: "alice@example.com" }, want: { userId: ALICE, userEmail: "alice@example.com" } },
    { name: "logged in without an email → sub only", user: { sub: BOB }, want: { userId: BOB } },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.deepEqual(ownerFields(tc.user), tc.want));
  }

  await t.test("an anonymous check is a complete CheckResult", () => {
    const anon = { ...check("CK-005", "2026-11-08T05:00:00.000Z"), ...ownerFields(null) };
    assert.equal("userId" in anon, false);
    assert.equal("userEmail" in anon, false);
    assert.deepEqual(publicCheck(anon), anon);
  });
});

test("publicCheck strips the owner and keeps everything else", () => {
  const owned = checks[0];
  const out = publicCheck(owned);
  assert.equal("userId" in out, false);
  assert.equal("userEmail" in out, false);
  assert.deepEqual(out, check("CK-001", "2026-11-08T01:00:00.000Z"));
  assert.equal(owned.userId, ALICE, "does not mutate the stored check");
});
