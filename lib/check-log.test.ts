import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCheckVerifyResult, checkLogHash, checkLogMemo, parseCheckLogMemo } from "./check-log";
import { sha256 } from "./hash";
import type { Alert, CheckResult } from "./types";

const alert = { id: "AL-001", title: "Boil Water Advisory", body: "Boil water." } as Alert;

const check: CheckResult = {
  id: "CK-020",
  inputType: "image",
  extractedText: "- Water is safe to drink.",
  verdict: "CONTRADICTED",
  basis: "official_match",
  summary: "Contradicts AL-001.",
  matchedAlert: alert,
  differences: [],
  sources: [],
  redFlags: [],
  limitations: [],
  createdAt: "2026-11-08T08:00:00.000Z",
  inputHash: "a".repeat(64),
  mediaHash: "b".repeat(64),
  userId: "auth0|alice",
  userEmail: "alice@example.com",
};

const LOG_KEY = "LogWa11et1111111111111111111111111111111111";

test("checkLogHash", async (t) => {
  await t.test("hashes exactly this canonical JSON (key order is part of the protocol)", () => {
    const canonical =
      '{"checkId":"CK-020","verdict":"CONTRADICTED","basis":"official_match","matchedAlertId":"AL-001",' +
      `"createdAt":"2026-11-08T08:00:00.000Z","inputHash":"${"a".repeat(64)}","mediaHash":"${"b".repeat(64)}"}`;
    assert.equal(checkLogHash(check), sha256(canonical));
  });

  await t.test("is stable: same check, any property order, any extra fields", () => {
    const reordered = Object.fromEntries(Object.entries(check).reverse()) as CheckResult;
    assert.equal(checkLogHash(reordered), checkLogHash(check));
    const withExtras: CheckResult = { ...check, summary: "edited prose", chainStatus: "confirmed", chainSignature: "sig" };
    assert.equal(checkLogHash(withExtras), checkLogHash(check));
  });

  await t.test("missing optional fields hash as null", () => {
    const bare = { ...check, matchedAlert: undefined, inputHash: undefined, mediaHash: undefined };
    const canonical =
      '{"checkId":"CK-020","verdict":"CONTRADICTED","basis":"official_match","matchedAlertId":null,' +
      '"createdAt":"2026-11-08T08:00:00.000Z","inputHash":null,"mediaHash":null}';
    assert.equal(checkLogHash(bare), sha256(canonical));
  });

  for (const [name, change] of [
    ["verdict", { verdict: "VERIFIED_OFFICIAL" }],
    ["basis", { basis: "web_sources" }],
    ["matched alert", { matchedAlert: { ...alert, id: "AL-002" } }],
    ["time", { createdAt: "2026-11-08T08:00:01.000Z" }],
    ["input", { inputHash: "c".repeat(64) }],
    ["media", { mediaHash: "d".repeat(64) }],
  ] as const) {
    await t.test(`changes when the ${name} changes`, () => assert.notEqual(checkLogHash({ ...check, ...change }), checkLogHash(check)));
  }
});

test("check log memo", async (t) => {
  const hash = checkLogHash(check);
  const memo = checkLogMemo(check.id, hash);

  await t.test("format", () => assert.equal(memo, `crisissignal:check:v1:CK-020:${hash}`));
  await t.test("round-trips", () => assert.deepEqual(parseCheckLogMemo(memo), { checkId: "CK-020", hash }));
  await t.test("carries no text, media or user info", () => {
    for (const secret of ["Water", "safe", "alice", "auth0", check.inputHash!, check.mediaHash!]) assert.equal(memo.includes(secret), false, secret);
  });
  for (const bad of ["crisissignal:check:v2:CK-020:" + hash, "crisissignal:check:v1:CK-020:" + hash.toUpperCase(), "crisissignal:v1:" + hash, ""]) {
    await t.test(`rejects ${JSON.stringify(bad.slice(0, 30))}`, () => assert.equal(parseCheckLogMemo(bad), null));
  }
});

test("buildCheckVerifyResult", async (t) => {
  const logged = { ...check, chainSignature: "5ig", chainStatus: "confirmed" as const };
  const memo = checkLogMemo(check.id, checkLogHash(check));

  await t.test("intact", () => {
    const r = buildCheckVerifyResult(logged, { memo, signer: LOG_KEY }, LOG_KEY);
    assert.equal(r.hashMatches && r.signerIsCheckLog, true);
    assert.equal(r.explorerUrl, "https://explorer.solana.com/tx/5ig?cluster=devnet");
  });
  await t.test("verdict edited after logging → mismatch", () => {
    const r = buildCheckVerifyResult({ ...logged, verdict: "VERIFIED_OFFICIAL" }, { memo, signer: LOG_KEY }, LOG_KEY);
    assert.equal(r.hashMatches, false);
  });
  await t.test("right hash, wrong signer → not trusted", () => {
    const r = buildCheckVerifyResult(logged, { memo, signer: "SomeoneE1se11111111111111111111111111111111" }, LOG_KEY);
    assert.equal(r.hashMatches, true);
    assert.equal(r.signerIsCheckLog, false);
  });
  await t.test("memo for a different check → no match", () => {
    const other = checkLogMemo("CK-999", checkLogHash(check));
    const r = buildCheckVerifyResult(logged, { memo: other, signer: LOG_KEY }, LOG_KEY);
    assert.equal(r.onChainHash, null);
    assert.equal(r.hashMatches, false);
  });
  await t.test("no transaction found", () => {
    const r = buildCheckVerifyResult(logged, null, LOG_KEY);
    assert.deepEqual([r.onChainHash, r.hashMatches, r.signerIsCheckLog], [null, false, false]);
  });
});
