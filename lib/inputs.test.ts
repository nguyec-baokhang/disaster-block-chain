import assert from "node:assert/strict";
import { test } from "node:test";
import { checkExtracted, sniffImageType } from "./inputs";
import { MAX_IMAGE_BYTES, imageError } from "./limits";

test("checkExtracted passes the extracted claims to the check pipeline", async (t) => {
  const extractedText = "- Hamilton County EMA says: boil water until Friday.\n- Severity: advisory.";

  await t.test("link: matching sees exactly the extracted text, and the source is kept", async () => {
    const seen: string[] = [];
    const draft = await checkExtracted(
      { inputType: "link", extractedText, sourceUrl: "https://news.example.com/a", sourceTitle: "Water advisory" },
      async (claims) => {
        seen.push(claims);
        return { verdict: "UNVERIFIED" as const, summary: "s" };
      },
    );
    assert.deepEqual(seen, [extractedText]);
    assert.deepEqual(draft, {
      inputType: "link",
      extractedText,
      sourceUrl: "https://news.example.com/a",
      sourceTitle: "Water advisory",
      verdict: "UNVERIFIED",
      summary: "s",
    });
  });

  await t.test("image: no URL or title fields, extracted text is checked", async () => {
    let seen = "";
    const draft = await checkExtracted({ inputType: "image", extractedText }, async (claims) => {
      seen = claims;
      return { verdict: "CONTRADICTED" as const };
    });
    assert.equal(seen, extractedText);
    assert.equal("sourceUrl" in draft, false);
    assert.equal("sourceTitle" in draft, false);
    assert.equal(draft.inputType, "image");
  });
});

test("imageError", async (t) => {
  const testCases = [
    { name: "PNG under the limit", type: "image/png", size: 1024, ok: true },
    { name: "JPEG under the limit", type: "image/jpeg", size: 5 * 1024 * 1024, ok: true },
    { name: "WEBP exactly at the limit", type: "image/webp", size: MAX_IMAGE_BYTES, ok: true },
    { name: "one byte over 10 MB", type: "image/png", size: MAX_IMAGE_BYTES + 1, ok: false },
    { name: "empty file", type: "image/png", size: 0, ok: false },
    { name: "GIF", type: "image/gif", size: 1024, ok: false },
    { name: "SVG", type: "image/svg+xml", size: 1024, ok: false },
    { name: "HEIC", type: "image/heic", size: 1024, ok: false },
    { name: "no type", type: "", size: 1024, ok: false },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.equal(imageError(tc.type, tc.size) === null, tc.ok));
  }
});

test("sniffImageType trusts magic bytes, not the declared type", async (t) => {
  const bytes = (...b: (number | string)[]) =>
    new Uint8Array(b.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));
  const testCases = [
    { name: "PNG", data: bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a), want: "image/png" },
    { name: "JPEG", data: bytes(0xff, 0xd8, 0xff, 0xe0), want: "image/jpeg" },
    { name: "WEBP", data: bytes("RIFF", 0, 0, 0, 0, "WEBP"), want: "image/webp" },
    { name: "HTML renamed to .png", data: bytes("<html><script>"), want: null },
    { name: "GIF", data: bytes("GIF89a"), want: null },
    { name: "empty", data: new Uint8Array(), want: null },
  ];
  for (const tc of testCases) {
    await t.test(tc.name, () => assert.equal(sniffImageType(tc.data), tc.want));
  }
});
