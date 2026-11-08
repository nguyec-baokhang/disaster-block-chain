import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCheckStats } from "./store";

const NOW = Date.parse("2026-11-08T06:30:00.000Z");

test("computeCheckStats", async (t) => {
  const checks = [
    { verdict: "UNVERIFIED" as const, createdAt: "2026-11-08T06:10:00.000Z" },
    { verdict: "UNVERIFIED" as const, createdAt: "2026-11-08T06:20:00.000Z" },
    { verdict: "VERIFIED_OFFICIAL" as const, createdAt: "2026-11-08T05:59:59.000Z" },
    { verdict: "CONTRADICTED" as const, createdAt: "2026-11-06T12:00:00.000Z" }, // older than 24h
  ];
  const stats = computeCheckStats(checks, NOW);

  await t.test("totals count every check", () => {
    assert.equal(stats.total, 4);
    assert.deepEqual(stats.byVerdict, { UNVERIFIED: 2, VERIFIED_OFFICIAL: 1, CONTRADICTED: 1 });
  });
  await t.test("buckets the last 24h by hour and verdict, oldest first", () => {
    assert.deepEqual(stats.hourly, [
      { bucket: "2026-11-08T05:00:00.000Z", verdict: "VERIFIED_OFFICIAL", count: 1 },
      { bucket: "2026-11-08T06:00:00.000Z", verdict: "UNVERIFIED", count: 2 },
    ]);
  });
  await t.test("handles no checks", () => {
    assert.deepEqual(computeCheckStats([], NOW), { total: 0, byVerdict: {}, hourly: [] });
  });
});
