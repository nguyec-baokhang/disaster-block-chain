import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretGrounded, shortDifferences } from "./gemini";

const SOURCES = [{ title: "USGS", uri: "https://usgs.gov" }];
const json = (o: object) => JSON.stringify(o);

test("interpretGrounded", async (t) => {
  const testCases = [
    {
      name: "SUPPORTED with sources stays SUPPORTED",
      text: json({ verdict: "SUPPORTED", summary: "Confirmed." }),
      sources: SOURCES,
      want: "SUPPORTED",
    },
    {
      name: "SUPPORTED without sources is forced UNVERIFIED",
      text: json({ verdict: "SUPPORTED", summary: "Confirmed." }),
      sources: [],
      want: "UNVERIFIED",
    },
    {
      name: "direct CONTRADICTED with sources stays CONTRADICTED",
      text: json({ verdict: "CONTRADICTED", contradictionBasis: "direct", summary: "False." }),
      sources: SOURCES,
      want: "CONTRADICTED",
    },
    {
      name: "CONTRADICTED with no basis is downgraded (absence of evidence)",
      text: json({ verdict: "CONTRADICTED", contradictionBasis: null, summary: "No news found." }),
      sources: SOURCES,
      want: "UNVERIFIED",
    },
    {
      name: "authoritative_absence without a named source is downgraded",
      text: json({ verdict: "CONTRADICTED", contradictionBasis: "authoritative_absence", authoritativeSource: "null" }),
      sources: SOURCES,
      want: "UNVERIFIED",
    },
    {
      name: "authoritative_absence with a named source stays CONTRADICTED",
      text: json({ verdict: "CONTRADICTED", contradictionBasis: "authoritative_absence", authoritativeSource: "USGS", summary: "No quake." }),
      sources: SOURCES,
      want: "CONTRADICTED",
    },
    {
      name: "CONTRADICTED without sources is forced UNVERIFIED",
      text: json({ verdict: "CONTRADICTED", contradictionBasis: "direct" }),
      sources: [],
      want: "UNVERIFIED",
    },
    {
      name: "markdown-fenced JSON is parsed",
      text: "```json\n" + json({ verdict: "SUPPORTED" }) + "\n```",
      sources: SOURCES,
      want: "SUPPORTED",
    },
    { name: "unreadable JSON is UNVERIFIED", text: "not json", sources: SOURCES, want: "UNVERIFIED" },
    { name: "unknown verdict is UNVERIFIED", text: json({ verdict: "TRUE" }), sources: SOURCES, want: "UNVERIFIED" },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => {
      const got = interpretGrounded(tc.text, tc.sources);
      assert.equal(got.verdict, tc.want);
      assert.deepEqual(got.sources, tc.sources, "sources come only from grounding metadata");
    });
  }
});

test("shortDifferences", async (t) => {
  const official = "Residents of Green Township should boil tap water for 1 minute before drinking.";
  const testCases = [
    {
      name: "keeps short specific items",
      items: ["Instruction changed: boil water → evacuate"],
      want: ["Instruction changed: boil water → evacuate"],
    },
    {
      name: "drops items that paste the whole official text",
      items: [`Original: ${official}`, "Severity changed: advisory → emergency"],
      want: ["Severity changed: advisory → emergency"],
    },
    {
      name: "matches regardless of case and whitespace",
      items: [official.toUpperCase().replace(/ /g, "  ")],
      want: [],
    },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.deepEqual(shortDifferences(tc.items, [official]), tc.want));
  }
});
