import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { ADMIN_COOKIE, SESSION_SECONDS, createSessionToken, passwordMatches, requireAdmin, verifySessionToken } from "./admin";

const PASSWORD = "correct horse";
const NOW = Date.parse("2026-11-08T06:00:00.000Z");

test("passwordMatches", async (t) => {
  const testCases = [
    { name: "accepts the configured password", input: PASSWORD, password: PASSWORD, want: true },
    { name: "rejects a wrong password", input: "wrong", password: PASSWORD, want: false },
    { name: "rejects a prefix of the password", input: "correct", password: PASSWORD, want: false },
    { name: "rejects everything when no password is configured", input: "", password: "", want: false },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.equal(passwordMatches(tc.input, tc.password), tc.want));
  }
});

test("verifySessionToken", async (t) => {
  const token = createSessionToken(PASSWORD, NOW);
  const [exp, mac] = token.split(".");
  const testCases = [
    { name: "accepts a fresh token", token, password: PASSWORD, now: NOW, want: true },
    { name: "rejects an expired token", token, password: PASSWORD, now: NOW + (SESSION_SECONDS + 1) * 1000, want: false },
    { name: "rejects a token signed with another password", token, password: "other", now: NOW, want: false },
    { name: "rejects an extended expiry", token: `${Number(exp) + 3600}.${mac}`, password: PASSWORD, now: NOW, want: false },
    { name: "rejects a forged signature", token: `${exp}.AAAA`, password: PASSWORD, now: NOW, want: false },
    { name: "rejects garbage", token: "admin=true", password: PASSWORD, now: NOW, want: false },
    { name: "rejects a missing token", token: undefined, password: PASSWORD, now: NOW, want: false },
    { name: "rejects any token when no password is configured", token, password: "", now: NOW, want: false },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.equal(verifySessionToken(tc.token, tc.password, tc.now), tc.want));
  }
});

test("admin gate", async (t) => {
  const saved = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = PASSWORD;
  t.after(() => {
    if (saved === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = saved;
  });
  const valid = `${ADMIN_COOKIE}=${createSessionToken()}`;

  const apiCases = [
    { name: "API: no cookie → 401", cookie: undefined, want: 401 },
    { name: "API: bad cookie → 401", cookie: `${ADMIN_COOKIE}=1.bad`, want: 401 },
    { name: "API: valid cookie among others → allowed", cookie: `theme=dark; ${valid}`, want: null },
  ];
  for (const tc of apiCases) {
    await t.test(tc.name, () => {
      const headers = tc.cookie ? { cookie: tc.cookie } : undefined;
      const res = requireAdmin(new Request("http://localhost/api/alerts", { method: "POST", headers }));
      assert.equal(res?.status ?? null, tc.want);
    });
  }

  const pageCases = [
    { name: "/publish: no cookie → redirect to /admin/login", cookie: undefined, wantLocation: "http://localhost/admin/login" },
    { name: "/publish: valid cookie → passes through", cookie: valid, wantLocation: null },
  ];
  for (const tc of pageCases) {
    await t.test(tc.name, () => {
      const headers = tc.cookie ? { cookie: tc.cookie } : undefined;
      const res = proxy(new NextRequest("http://localhost/publish", { headers }));
      assert.equal(res.headers.get("location"), tc.wantLocation);
    });
  }
});
