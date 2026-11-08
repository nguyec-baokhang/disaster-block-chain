import assert from "node:assert/strict";
import { test } from "node:test";
import config from "@/config/agencies.json";
import { contentHash } from "./hash";
import type { Alert } from "./types";
import { buildVerifyResult, isLocallyIntact, type OnChainMemo } from "./verify";

const [hamilton, nws] = config;

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  const fields = { agencyId: hamilton.id, title: "Boil Water Advisory", body: "Boil water.", issuedAt: "2026-11-08T01:00:00.000Z" };
  return {
    id: "AL-001",
    agencyName: hamilton.name,
    ...fields,
    contentHash: contentHash(fields),
    signature: "sig",
    chainStatus: "confirmed",
    explorerUrl: "https://explorer.solana.com/tx/sig?cluster=devnet",
    ...overrides,
  };
}

const memoFor = (a: Alert, signer = hamilton.pubkey): OnChainMemo => ({
  memo: `crisissignal:v1:${a.id}:${a.contentHash}`,
  signer,
});

test("isLocallyIntact", async (t) => {
  const testCases = [
    { name: "untouched alert", alert: makeAlert(), want: true },
    { name: "body edited after hashing", alert: { ...makeAlert(), body: "EVACUATE NOW" }, want: false },
    { name: "agencyName edited", alert: makeAlert({ agencyName: "FEMA" }), want: false },
    { name: "unknown agencyId", alert: makeAlert({ agencyId: "nope" }), want: false },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.equal(isLocallyIntact(tc.alert), tc.want));
  }
});

test("buildVerifyResult", async (t) => {
  const alert = makeAlert();
  const testCases = [
    {
      name: "intact record signed by its agency",
      alert,
      onChain: memoFor(alert),
      want: { hashMatches: true, signerIsKnownAgency: true, onChainHash: alert.contentHash },
    },
    {
      name: "no memo on chain",
      alert,
      onChain: null,
      want: { hashMatches: false, signerIsKnownAgency: false, onChainHash: null, signer: null },
    },
    {
      name: "body tampered locally",
      alert: { ...alert, body: "EVACUATE NOW" },
      onChain: memoFor(alert),
      want: { hashMatches: false, signerIsKnownAgency: true },
    },
    {
      name: "memo copied from another alert ID",
      alert: { ...alert, id: "AL-002" },
      onChain: memoFor(alert),
      want: { hashMatches: false },
    },
    {
      name: "signed by a different known agency",
      alert,
      onChain: memoFor(alert, nws.pubkey),
      want: { hashMatches: true, signerIsKnownAgency: false },
    },
    {
      name: "signed by an unknown wallet",
      alert,
      onChain: memoFor(alert, "11111111111111111111111111111111"),
      want: { hashMatches: true, signerIsKnownAgency: false },
    },
    {
      name: "agencyName edited locally",
      alert: { ...alert, agencyName: "FEMA" },
      onChain: memoFor(alert),
      want: { hashMatches: true, signerIsKnownAgency: false },
    },
    {
      name: "memo in an unexpected format",
      alert,
      onChain: { memo: "hello", signer: hamilton.pubkey },
      want: { hashMatches: false, onChainHash: null },
    },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => {
      const got = buildVerifyResult(tc.alert, tc.onChain);
      assert.equal(got.localHash, contentHash(tc.alert));
      for (const [key, value] of Object.entries(tc.want)) {
        assert.equal(got[key as keyof typeof got], value, key);
      }
    });
  }
});
