import assert from "node:assert/strict";
import { test } from "node:test";
import { alertEmbeddingText, checkEmbeddingText, embed } from "./embed";
import { EMBED_DIMENSIONS, normalize, toVectorLiteral } from "./vector";

test("embedding text", async (t) => {
  await t.test("alert: title + body", () =>
    assert.equal(alertEmbeddingText({ title: "Boil Water Advisory", body: "Boil tap water for 1 minute." }), "Boil Water Advisory\n\nBoil tap water for 1 minute."));

  const testCases = [
    { name: "text → the pasted text", check: { inputType: "text" as const, inputText: " Water is safe. " }, want: "Water is safe." },
    { name: "link → extracted claims", check: { inputType: "link" as const, extractedText: "- Freeze warning." }, want: "- Freeze warning." },
    { name: "screenshot → extracted claims", check: { inputType: "image" as const, extractedText: "- Advisory lifted." }, want: "- Advisory lifted." },
    { name: "video → transcript", check: { inputType: "video" as const, inputTranscript: "Evacuate now." }, want: "Evacuate now." },
    { name: "exact-hash video with no transcript → nothing to embed", check: { inputType: "video" as const }, want: null },
    { name: "empty text → nothing", check: { inputType: "text" as const, inputText: "   " }, want: null },
  ];
  for (const tc of testCases) await t.test(tc.name, () => assert.equal(checkEmbeddingText(tc.check), tc.want));
});

test("vector helpers", async (t) => {
  await t.test("normalize gives unit length", () => {
    const v = normalize([3, 4]);
    assert.deepEqual(v, [0.6, 0.8]);
  });
  await t.test("normalize leaves a zero vector alone", () => assert.deepEqual(normalize([0, 0]), [0, 0]));
  await t.test("pgvector literal", () => {
    const v = Array.from({ length: EMBED_DIMENSIONS }, (_, i) => i / 1000);
    const lit = toVectorLiteral(v);
    assert.ok(lit.startsWith("[0,0.001,0.002,") && lit.endsWith("]"));
  });
  await t.test("rejects the wrong length or non-finite values", () => {
    assert.throws(() => toVectorLiteral([1, 2, 3]));
    assert.throws(() => toVectorLiteral(Array.from({ length: EMBED_DIMENSIONS }, () => NaN)));
  });
});

test("embed is best-effort and never throws", async (t) => {
  await t.test("no text → null", async () => assert.equal(await embed(null), null));
  await t.test("Gemini unavailable (no API key) → null", async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      assert.equal(await embed("Boil water"), null);
    } finally {
      if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
    }
  });
});
