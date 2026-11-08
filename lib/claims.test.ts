import assert from "node:assert/strict";
import { test } from "node:test";
import { tidyClaims } from "./claims";

test("tidyClaims", async (t) => {
  const testCases = [
    {
      name: "collapses duplicate leading bullets",
      input: "- - Boil water until Friday.\n* - Shelter open at Oak Hills HS.\n1. - Call 311.",
      want: "- Boil water until Friday.\n- Shelter open at Oak Hills HS.\n- Call 311.",
    },
    {
      name: "one claim per line, blank lines dropped",
      input: "\n  - Freeze warning until 10 AM.  \n\n•  Cover plants.\n",
      want: "- Freeze warning until 10 AM.\n- Cover plants.",
    },
    {
      name: "turns a labeled screenshot line into a plain claim, dropping 'not stated'",
      input: "- Who: Hamilton County EMA; What: water is safe to drink; Where: Green Township; Instruction: Not stated; Severity: unknown",
      want: "- Hamilton County EMA, water is safe to drink, Green Township",
    },
    {
      name: "keeps the source line without a bullet",
      input: "- - Advisory lifted.\nSHOWN AS FROM: Hamilton County EMA",
      want: "- Advisory lifted.\nShown as from: Hamilton County EMA",
    },
    {
      name: "drops an unknown source line",
      input: "- Advisory lifted.\n- SHOWN AS FROM: unknown",
      want: "- Advisory lifted.",
    },
    {
      name: "leaves ordinary sentences with colons and semicolons alone",
      input: "- Update: shelters close at 9 PM; bring ID.",
      want: "- Update: shelters close at 9 PM; bring ID.",
    },
    {
      name: "drops exact duplicate claims",
      input: "- Boil water.\n- - Boil water.",
      want: "- Boil water.",
    },
    {
      name: "is idempotent",
      input: "- Boil water.\nShown as from: EMA",
      want: "- Boil water.\nShown as from: EMA",
    },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.equal(tidyClaims(tc.input), tc.want));
  }
});
