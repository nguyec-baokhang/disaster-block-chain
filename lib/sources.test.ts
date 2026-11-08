import assert from "node:assert/strict";
import { test } from "node:test";
import { publicCheck } from "./checks";
import { interpretGrounded } from "./gemini";
import { MAX_SOURCES, filterSources, isFirstPerson, sourceDomain } from "./sources";
import type { CheckResult, Source } from "./types";

// Gemini grounding URIs are redirects; the domain is in the title.
const g = (domain: string, n = 1): Source => ({ title: domain, uri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${domain}-${n}` });

test("sourceDomain", async (t) => {
  await t.test("redirect URI → title", () => assert.equal(sourceDomain(g("www.weather.gov")), "weather.gov"));
  await t.test("direct URI → host", () => assert.equal(sourceDomain({ title: "NWS", uri: "https://m.weather.gov/x" }), "weather.gov"));
  await t.test("redirect with a non-domain title → unknown", () =>
    assert.equal(sourceDomain({ title: "National Weather Service", uri: "https://vertexaisearch.cloud.google.com/r/1" }), null));
});

test("filterSources", async (t) => {
  await t.test("drops social and video platforms, including subdomains", () => {
    const blocked = ["youtube.com", "m.youtube.com", "youtu.be", "tiktok.com", "vm.tiktok.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "reddit.com", "old.reddit.com"];
    assert.deepEqual(filterSources(blocked.map((d) => g(d))), []);
  });
  await t.test("doesn't block look-alikes", () =>
    assert.deepEqual(filterSources([g("box.com"), g("notreddit.com")]).map((s) => s.title), ["box.com", "notreddit.com"]));
  await t.test("one per domain, first wins", () =>
    assert.deepEqual(filterSources([g("weather.gov", 1), g("www.weather.gov", 2), g("wlwt.com")]).map((s) => s.uri), [g("weather.gov", 1).uri, g("wlwt.com").uri]));
  await t.test(`at most ${MAX_SOURCES}`, () =>
    assert.equal(filterSources(Array.from({ length: 10 }, (_, i) => g(`site${i}.org`))).length, MAX_SOURCES));
});

test("grounded verdicts use the filtered sources", async (t) => {
  const supported = JSON.stringify({ verdict: "SUPPORTED", summary: "Confirmed.", limitations: ["I could not access the full article.", "My search was limited."] });

  await t.test("only social/video sources → UNVERIFIED (no sources we can show)", () => {
    const r = interpretGrounded(supported, [g("youtube.com"), g("x.com"), g("reddit.com")]);
    assert.equal(r.verdict, "UNVERIFIED");
    assert.deepEqual(r.sources, []);
    assert.deepEqual(r.limitations, ["The only sources found were social media or video platforms, so this can't be confirmed or refuted."]);
  });
  await t.test("a credible source survives the filter → SUPPORTED, platforms removed", () => {
    const r = interpretGrounded(supported, [g("youtube.com"), g("weather.gov"), g("weather.gov", 2)]);
    assert.equal(r.verdict, "SUPPORTED");
    assert.deepEqual(r.sources.map((s) => s.title), ["weather.gov"]);
  });
  await t.test("Gemini-written limitations are never kept", () => {
    const r = interpretGrounded(supported, [g("weather.gov")]);
    assert.deepEqual(r.limitations, []);
  });
  await t.test("our own standard lines are kept", () => {
    const r = interpretGrounded(JSON.stringify({ verdict: "CONTRADICTED", contradictionBasis: null }), [g("weather.gov")]);
    assert.deepEqual(r.limitations, ["No source directly contradicted this, and lack of evidence alone isn't proof it's false."]);
  });
});

test("isFirstPerson", async (t) => {
  const cases: [string, boolean][] = [
    ["I could not verify the date.", true],
    ["I'm unable to access local news.", true],
    ["My search returned few results.", true],
    ["The results available to me were limited.", true],
    ["We couldn't compare this against official alerts right now.", false],
    ["Matching against official alerts is done by AI and can make mistakes.", false],
    ["Interstate I-75 closures were not confirmed.", false],
  ];
  for (const [line, want] of cases) await t.test(line, () => assert.equal(isFirstPerson(line), want));
});

test("publicCheck applies the display rules to older stored checks", () => {
  const old: CheckResult = {
    id: "CK-005",
    inputType: "text",
    inputText: "x",
    verdict: "SUPPORTED",
    basis: "web_sources",
    summary: "",
    differences: [],
    sources: [g("youtube.com"), g("weather.gov"), g("weather.gov", 2)],
    redFlags: [],
    limitations: ["I could not find the original post.", "Matching against official alerts is done by AI and can make mistakes."],
    createdAt: "2026-11-08T00:00:00.000Z",
  };
  const out = publicCheck(old);
  assert.deepEqual(out.sources.map((s) => s.title), ["weather.gov"]);
  assert.deepEqual(out.limitations, ["Matching against official alerts is done by AI and can make mistakes."]);
});
