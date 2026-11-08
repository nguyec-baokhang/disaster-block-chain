import assert from "node:assert/strict";
import { test } from "node:test";
import { contentHash, sha256 } from "./hash";

const base = { agencyId: "hamilton-ema", title: "Boil Water Advisory", body: "Boil water.", issuedAt: "2026-11-08T01:00:00.000Z" };

test("contentHash", async (t) => {
  const testCases = [
    {
      name: "hashes the canonical key order from PLAN.md section 9",
      alert: base,
      want: sha256(JSON.stringify({ ...base, mediaHash: null })),
    },
    {
      name: "ignores input key order",
      alert: { issuedAt: base.issuedAt, body: base.body, title: base.title, agencyId: base.agencyId },
      want: sha256(JSON.stringify({ ...base, mediaHash: null })),
    },
    {
      name: "includes mediaHash when present",
      alert: { ...base, mediaHash: "ab".repeat(32) },
      want: sha256(JSON.stringify({ ...base, mediaHash: "ab".repeat(32) })),
    },
    {
      name: "ignores fields outside the protocol",
      alert: { ...base, transcript: "x", sourceUrl: "https://example.com" },
      want: sha256(JSON.stringify({ ...base, mediaHash: null })),
    },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.equal(contentHash(tc.alert), tc.want));
  }
});
