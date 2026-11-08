import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEvidenceView, mostCommonVerdict } from "./evidence";
import { withSeenCounts, type LedgerEntry } from "./ledger";
import { orderForMatcher } from "./rag";
import type { Alert, CheckResult, Verdict } from "./types";

function c(id: string, createdAt: string, verdict: Verdict = "CONTRADICTED", extra: Partial<CheckResult> = {}): CheckResult {
  return {
    id,
    inputType: "image",
    verdict,
    basis: "official_match",
    summary: "",
    differences: [],
    sources: [],
    redFlags: [],
    limitations: [],
    createdAt,
    ...extra,
  };
}

test("orderForMatcher passes ALL alerts, retrieved first", async (t) => {
  const all = ["AL-001", "AL-003", "AL-004", "AL-005"].map((id) => ({ id }) as Alert);
  const ids = (a: Alert[]) => a.map((x) => x.id);
  await t.test("retrieved first, then the rest in their usual order", () =>
    assert.deepEqual(ids(orderForMatcher([all[2], all[0]], all)), ["AL-004", "AL-001", "AL-003", "AL-005"]));
  await t.test("nothing retrieved → every alert", () => assert.deepEqual(ids(orderForMatcher([], all)), ids(all)));
  await t.test("a retrieved alert that is no longer official is dropped", () =>
    assert.deepEqual(ids(orderForMatcher([{ id: "AL-999" } as Alert, all[1]], all)), ["AL-003", "AL-001", "AL-004", "AL-005"]));
});

test("buildEvidenceView", async (t) => {
  const me = c("CK-10", "2026-11-08T10:00:00.000Z", "CONTRADICTED", { mediaHash: "m", ledgerEvidence: ["CK-04"] });
  const media = [
    c("CK-02", "2026-11-08T02:00:00.000Z", "CONTRADICTED", { mediaHash: "m" }),
    c("CK-06", "2026-11-08T06:00:00.000Z", "UNVERIFIED", { mediaHash: "m" }),
    me, // itself
    c("CK-12", "2026-11-08T12:00:00.000Z", "CONTRADICTED", { mediaHash: "m" }), // later
  ];
  const similar = [
    { check: c("CK-04", "2026-11-08T04:00:00.000Z", "CONTRADICTED", { chainStatus: "confirmed", chainSignature: "s" }), similarity: 0.88 },
    { check: c("CK-05", "2026-11-08T05:00:00.000Z", "VERIFIED_OFFICIAL"), similarity: 0.95 },
    { check: c("CK-03", "2026-11-08T03:00:00.000Z", "CONTRADICTED"), similarity: 0.86 },
    { check: c("CK-07", "2026-11-08T07:00:00.000Z", "UNVERIFIED"), similarity: 0.8 }, // retrieval-close, but below 0.85
    { check: c("CK-01", "2026-11-08T01:00:00.000Z", "SUPPORTED"), similarity: 0.6 },
    { check: c("CK-11", "2026-11-08T11:00:00.000Z", "SUPPORTED"), similarity: 0.99 }, // later
  ];
  const view = buildEvidenceView(me, media, similar);

  await t.test("exact media: earlier copies only, not itself or later ones", () =>
    assert.deepEqual(view.media, { count: 2, firstSeen: "2026-11-08T02:00:00.000Z" }));
  await t.test("similar: earlier, >= 0.85 (not the 0.75 retrieval threshold), first seen, most common verdict", () =>
    assert.deepEqual(view.similar, { count: 3, firstSeen: "2026-11-08T03:00:00.000Z", commonVerdict: "CONTRADICTED" }));
  await t.test("top 3: verified evidence first, then same file, then most similar", () => {
    assert.deepEqual(
      view.top.map((r) => [r.id, r.via, r.trusted, r.logged]),
      [
        ["CK-04", "semantic", true, true],
        ["CK-02", "media", false, false],
        ["CK-06", "media", false, false],
      ],
    );
    assert.equal(view.top[0].similarity, 0.88);
    assert.equal(view.top.some((r) => r.id === "CK-07"), false);
  });
  await t.test("nothing earlier → nothing to show", () => {
    const first = c("CK-01", "2026-11-08T00:00:00.000Z");
    assert.deepEqual(buildEvidenceView(first, [first], [{ check: first, similarity: 1 }]), { media: null, similar: null, top: [] });
  });
  await t.test("only public fields leave the server", () => {
    const keys = new Set(view.top.flatMap((r) => Object.keys(r)));
    assert.deepEqual([...keys].sort(), ["createdAt", "id", "logged", "similarity", "trusted", "verdict", "via"]);
  });
});

test("mostCommonVerdict", async (t) => {
  const v = (...vs: Verdict[]) => vs.map((verdict) => ({ verdict }));
  await t.test("majority", () => assert.equal(mostCommonVerdict(v("UNVERIFIED", "CONTRADICTED", "CONTRADICTED")), "CONTRADICTED"));
  await t.test("tie goes to the more decisive verdict", () => assert.equal(mostCommonVerdict(v("UNVERIFIED", "CONTRADICTED")), "CONTRADICTED"));
  await t.test("empty", () => assert.equal(mostCommonVerdict([]), null));
});

test("withSeenCounts shows cluster size only when seen more than once", () => {
  const e = (id: string, claimId?: string) => ({ id, verdict: "CONTRADICTED", inputType: "text", preview: "", createdAt: "", ...(claimId ? { claimId } : {}) }) as LedgerEntry;
  const out = withSeenCounts([e("CK-1", "CK-1"), e("CK-2", "CK-1"), e("CK-3", "CK-3"), e("CK-4")], new Map([["CK-1", 2], ["CK-3", 1]]));
  assert.deepEqual(out.map((x) => x.seenCount), [2, 2, undefined, undefined]);
});
