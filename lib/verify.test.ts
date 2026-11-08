import assert from "node:assert/strict";
import { test } from "node:test";
import config from "@/config/agencies.json";
import { contentHash } from "./hash";
import type { Alert } from "./types";
import { buildAnchorVerifyResult, buildVerifyResult, isLocallyIntact, type OnChainMemo } from "./verify";
import type { RegistryAgency, RegistryAlert } from "./registry";

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

const registryFor = (a: Alert, authority = hamilton.pubkey, overrides: Partial<RegistryAlert> = {}): RegistryAlert => ({
  address: "AlertPda1111111111111111111111111111111111",
  authority,
  contentHash: a.contentHash,
  alertId: a.id,
  issuedAt: a.issuedAt,
  status: "Active",
  supersededBy: null,
  ...overrides,
});

const agencyRecord = (active = true): RegistryAgency => ({
  address: "AgencyPda111111111111111111111111111111111",
  name: hamilton.name,
  authority: hamilton.pubkey,
  active,
});

test("buildAnchorVerifyResult", async (t) => {
  const alert = makeAlert({ chainRecord: "anchor" });
  const testCases = [
    {
      name: "intact active record",
      alert,
      onChain: registryFor(alert),
      agency: agencyRecord(),
      want: { hashMatches: true, signerIsKnownAgency: true, agencyActive: true, registryStatus: "Active", chainRecord: "anchor" },
    },
    {
      name: "no Alert PDA",
      alert,
      onChain: null,
      agency: agencyRecord(),
      want: { hashMatches: false, signerIsKnownAgency: false, onChainHash: null, signer: null, registryStatus: null },
    },
    {
      name: "body tampered locally",
      alert: { ...alert, body: "EVACUATE NOW" },
      onChain: registryFor(alert),
      agency: agencyRecord(),
      want: { hashMatches: false, signerIsKnownAgency: true },
    },
    {
      name: "record copied from another alert ID",
      alert: { ...alert, id: "AL-002" },
      onChain: registryFor(alert),
      agency: agencyRecord(),
      want: { hashMatches: false },
    },
    {
      name: "published by a different known agency",
      alert,
      onChain: registryFor(alert, nws.pubkey),
      agency: agencyRecord(),
      want: { hashMatches: true, signerIsKnownAgency: false },
    },
    {
      name: "agencyName edited locally",
      alert: { ...alert, agencyName: "FEMA" },
      onChain: registryFor(alert),
      agency: agencyRecord(),
      want: { hashMatches: true, signerIsKnownAgency: false },
    },
    {
      name: "agency deactivated",
      alert,
      onChain: registryFor(alert),
      agency: agencyRecord(false),
      want: { hashMatches: true, signerIsKnownAgency: true, agencyActive: false },
    },
    {
      name: "agency not registered",
      alert,
      onChain: registryFor(alert),
      agency: null,
      want: { agencyActive: false },
    },
    {
      name: "retracted record is still intact",
      alert,
      onChain: registryFor(alert, hamilton.pubkey, { status: "Retracted" }),
      agency: agencyRecord(),
      want: { hashMatches: true, signerIsKnownAgency: true, registryStatus: "Retracted" },
    },
    {
      name: "superseded record names its replacement",
      alert,
      onChain: registryFor(alert, hamilton.pubkey, { status: "Superseded", supersededBy: "NewPda" }),
      agency: agencyRecord(),
      want: { registryStatus: "Superseded", supersededBy: "NewPda" },
    },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => {
      const got = buildAnchorVerifyResult(tc.alert, tc.onChain, tc.agency);
      assert.equal(got.localHash, contentHash(tc.alert));
      for (const [key, value] of Object.entries(tc.want)) {
        assert.equal(got[key as keyof typeof got], value, key);
      }
    });
  }
});
