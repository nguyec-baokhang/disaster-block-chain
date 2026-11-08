import assert from "node:assert/strict";
import { test } from "node:test";

// lib/auth0.ts reads AUTH0_DOMAIN when it loads, so configure Auth0 before importing the route.
// (node --test runs each test file in its own process, so this doesn't leak into other tests.)
Object.assign(process.env, {
  AUTH0_DOMAIN: "test-tenant.us.auth0.com",
  AUTH0_CLIENT_ID: "test",
  AUTH0_CLIENT_SECRET: "test",
  AUTH0_SECRET: "0".repeat(64),
  APP_BASE_URL: "http://localhost:3000",
});

test("POST /api/check without a login → 401, before any work is done", async () => {
  const { POST } = await import("../app/api/check/route");
  const form = new FormData();
  form.append("text", "URGENT: the water is poisoned, share now");
  const res = await POST(new Request("http://localhost:3000/api/check", { method: "POST", body: form }));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Log in to check a claim." });
});
