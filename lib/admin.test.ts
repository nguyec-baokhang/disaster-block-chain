import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { ADMIN_COOKIE, SESSION_SECONDS, createSessionToken, passwordMatches, verifySessionToken } from "./admin";
import { adminEmails, isAdminUser, requireAdmin } from "./admin-auth";

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
    await t.test(tc.name, async () => {
      const headers = tc.cookie ? { cookie: tc.cookie } : undefined;
      const res = await requireAdmin(new Request("http://localhost/api/alerts", { method: "POST", headers }));
      assert.equal(res?.status ?? null, tc.want);
    });
  }

  const pageCases = [
    { name: "/publish: no cookie → redirect to /admin/login", cookie: undefined, wantLocation: "http://localhost/admin/login" },
    { name: "/publish: valid cookie → passes through", cookie: valid, wantLocation: null },
    { name: "/publish: forged Auth0-looking cookie → redirect", cookie: "__session=forged", wantLocation: "http://localhost/admin/login" },
  ];
  await t.test("/my-checks without Auth0 → rewritten to a 404 path", async () => {
    const res = await proxy(new NextRequest("http://localhost/my-checks"));
    assert.equal(res.headers.get("x-middleware-rewrite"), "http://localhost/_my-checks-disabled");
  });
  await t.test("public routes pass through without a cookie", async () => {
    const res = await proxy(new NextRequest("http://localhost/alerts"));
    assert.equal(res.headers.get("location"), null);
  });
  for (const tc of pageCases) {
    await t.test(tc.name, async () => {
      const headers = tc.cookie ? { cookie: tc.cookie } : undefined;
      const res = await proxy(new NextRequest("http://localhost/publish", { headers }));
      assert.equal(res.headers.get("location"), tc.wantLocation);
    });
  }
});

test("adminEmails", async (t) => {
  const testCases = [
    { name: "splits, trims and lowercases", raw: " Ops@CrisisSignal.org , dev@example.com ", want: ["ops@crisissignal.org", "dev@example.com"] },
    { name: "drops empty entries", raw: "a@x.org,, ,", want: ["a@x.org"] },
    { name: "empty → no admins", raw: "", want: [] },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.deepEqual(adminEmails(tc.raw), tc.want));
  }
});

test("isAdminUser", async (t) => {
  const list = "ops@crisissignal.org, dev@example.com";
  const testCases = [
    { name: "verified email on the list", user: { email: "ops@crisissignal.org", email_verified: true }, want: true },
    { name: "matches case-insensitively", user: { email: "Dev@Example.COM", email_verified: true }, want: true },
    { name: "email not on the list", user: { email: "someone@else.org", email_verified: true }, want: false },
    { name: "unverified email on the list", user: { email: "ops@crisissignal.org", email_verified: false }, want: false },
    { name: "missing email_verified", user: { email: "ops@crisissignal.org" }, want: false },
    { name: "no email", user: { email_verified: true }, want: false },
    { name: "a list entry that is only a substring", user: { email: "ops@crisissignal.org.evil.com", email_verified: true }, want: false },
    { name: "no user", user: null, want: false },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.equal(isAdminUser(tc.user, list), tc.want));
  }
  await t.test("empty ADMIN_EMAILS → nobody", () =>
    assert.equal(isAdminUser({ email: "ops@crisissignal.org", email_verified: true }, ""), false));
});
