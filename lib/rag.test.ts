import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyEvidence, claimIdFor, hasTrustworthyBasis, isTrustedEvidence, type Candidate, type EvidenceFacts } from "./rag";
import type { Alert, CheckResult, RegistryStatus } from "./types";
import { cosineSimilarity, rankByCosine } from "./vector";

test("cosine ranking", async (t) => {
  const q = [1, 0, 0];
  const items = [
    { id: "AL-far", vector: [0, 1, 0] }, // 0
    { id: "AL-close", vector: [0.9, 0.1, 0] }, // ~0.994
    { id: "AL-same", vector: [2, 0, 0] }, // 1 (length doesn't matter)
    { id: "AL-mid", vector: [0.7, 0.7, 0] }, // ~0.707
    { id: "AL-opposite", vector: [-1, 0, 0] }, // -1
  ];

  await t.test("similarity", () => {
    assert.equal(cosineSimilarity(q, [3, 0, 0]), 1);
    assert.equal(cosineSimilarity(q, [0, 5, 0]), 0);
    assert.equal(cosineSimilarity(q, [0, 0, 0]), 0);
    assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
  });
  await t.test("most similar first, below 0.75 dropped", () =>
    assert.deepEqual(rankByCosine(q, items, 5, 0.75).map((r) => r.id), ["AL-same", "AL-close"]));
  await t.test("top-k", () => assert.deepEqual(rankByCosine(q, items, 1, 0).map((r) => r.id), ["AL-same"]));
  await t.test("no threshold keeps order down to the opposite vector", () =>
    assert.deepEqual(rankByCosine(q, items, 5, -1).map((r) => r.id), ["AL-same", "AL-close", "AL-mid", "AL-far", "AL-opposite"]));
});

// ---------- trust rules ----------

const AL1 = { id: "AL-001", chainRecord: "anchor" } as Alert;
const SIG = "5ig";

function past(id: string, extra: Partial<CheckResult> = {}): CheckResult {
  return {
    id,
    inputType: "text",
    inputText: "water is safe",
    verdict: "CONTRADICTED",
    basis: "official_match",
    summary: `summary of ${id}`,
    matchedAlert: AL1,
    differences: [],
    sources: [],
    redFlags: [],
    limitations: [],
    createdAt: "2026-11-08T08:00:00.000Z",
    chainStatus: "confirmed",
    chainSignature: SIG,
    ...extra,
  };
}

function facts(verified: string[], alerts: Record<string, RegistryStatus | "Missing"> = { "AL-001": "Active" }): EvidenceFacts {
  return { logVerified: new Map(verified.map((id) => [id, true])), alertStatus: new Map(Object.entries(alerts)) };
}

const semantic = (check: CheckResult, similarity = 0.8): Candidate => ({ check, similarity, via: "semantic" });

test("untrusted checks are never used as evidence", async (t) => {
  const testCases: { name: string; check: CheckResult; verified?: boolean }[] = [
    { name: "no basis (UNVERIFIED, nothing cited)", check: past("CK-1", { verdict: "UNVERIFIED", basis: "none", matchedAlert: undefined }) },
    { name: "web verdict without any cited source", check: past("CK-2", { verdict: "SUPPORTED", basis: "web_sources", matchedAlert: undefined, sources: [] }) },
    { name: "UNVERIFIED even with sources", check: past("CK-3", { verdict: "UNVERIFIED", basis: "web_sources", matchedAlert: undefined, sources: [{ title: "x", uri: "https://x" }] }) },
    { name: "official_match without a matched alert", check: past("CK-4", { matchedAlert: undefined }) },
    { name: "not logged on-chain", check: past("CK-5", { chainStatus: undefined, chainSignature: undefined }) },
    { name: "on-chain log pending", check: past("CK-6", { chainStatus: "pending" }) },
    { name: "on-chain log failed", check: past("CK-7", { chainStatus: "failed" }) },
    { name: "log doesn't verify (edited after logging)", check: past("CK-8"), verified: false },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => {
      const f = facts(tc.verified === false ? [] : [tc.check.id]);
      assert.equal(isTrustedEvidence(tc.check, f), false);
      const { trusted, seen } = classifyEvidence([semantic(tc.check)], f);
      assert.deepEqual(trusted, []);
      assert.equal(seen, 1, "still counts toward seen N times");
    });
  }

  await t.test("trusted: official match, verified log, alert Active", () => {
    const c = past("CK-9");
    assert.equal(hasTrustworthyBasis(c), true);
    assert.deepEqual(classifyEvidence([semantic(c)], facts(["CK-9"])).trusted, [
      { id: "CK-9", verdict: "CONTRADICTED", matchedAlertId: "AL-001", summary: "summary of CK-9", chainSignature: SIG },
    ]);
  });
  await t.test("trusted: cited sources, verified log (no alert to check)", () => {
    const c = past("CK-10", { verdict: "SUPPORTED", basis: "web_sources", matchedAlert: undefined, sources: [{ title: "NWS", uri: "https://weather.gov" }] });
    assert.equal(isTrustedEvidence(c, facts(["CK-10"], {})), true);
  });
});

test("a retracted or gone alert invalidates evidence", async (t) => {
  const c = past("CK-11");
  for (const status of ["Retracted", "Superseded", "Missing"] as const) {
    await t.test(status, () => {
      const { trusted, seen } = classifyEvidence([semantic(c)], facts(["CK-11"], { "AL-001": status }));
      assert.deepEqual(trusted, []);
      assert.equal(seen, 1);
    });
  }
  await t.test("unknown live status (read failed) is not trusted either", () =>
    assert.equal(isTrustedEvidence(c, facts(["CK-11"], {})), false));
});

test("mixed candidates: only trusted ones become evidence, all count as seen", () => {
  const trustedOne = past("CK-20");
  const retracted = past("CK-21", { matchedAlert: { id: "AL-009", chainRecord: "anchor" } as Alert });
  const anonymousGuess = past("CK-22", { verdict: "UNVERIFIED", basis: "none", matchedAlert: undefined });
  const f = facts(["CK-20", "CK-21", "CK-22"], { "AL-001": "Active", "AL-009": "Retracted" });
  const { trusted, seen } = classifyEvidence([semantic(trustedOne), semantic(retracted), semantic(anonymousGuess)], f);
  assert.deepEqual(trusted.map((e) => e.id), ["CK-20"]);
  assert.equal(seen, 3);
});

test("media memory and claim clusters", async (t) => {
  const first = past("CK-30", { claimId: "CK-30" });
  const later = past("CK-31", { claimId: "CK-30" });
  const loose = past("CK-32");

  await t.test("same check found by media and meaning counts once", () => {
    const { seen } = classifyEvidence([{ check: first, similarity: 1, via: "media" }, semantic(first, 0.8)], facts([]));
    assert.equal(seen, 1);
  });
  await t.test("identical media joins that cluster", () =>
    assert.equal(claimIdFor([semantic(loose, 0.95), { check: later, similarity: 1, via: "media" }]), "CK-30"));
  await t.test("near-identical claim (>= 0.9) joins the cluster of the closest", () =>
    assert.equal(claimIdFor([semantic(loose, 0.8), semantic(later, 0.93)]), "CK-30"));
  await t.test("a check without claimId starts the cluster with its own id", () => assert.equal(claimIdFor([semantic(loose, 0.92)]), "CK-32"));
  await t.test("merely similar (0.75–0.9) starts a new cluster", () => assert.equal(claimIdFor([semantic(later, 0.85)]), null));
});
