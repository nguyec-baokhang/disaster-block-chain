// Link and screenshot checks: Gemini's extracted claims (not the raw page or image) are what get checked.
import type { CheckResult } from "./types";

export type ExtractedInput = {
  inputType: "link" | "image";
  extractedText: string;
  sourceUrl?: string;
  sourceTitle?: string;
};

type Source = Pick<CheckResult, "inputType" | "extractedText" | "sourceUrl" | "sourceTitle">;

// `run` is the normal check pipeline (official match, then grounded search).
export async function checkExtracted<T extends object>(input: ExtractedInput, run: (claims: string) => Promise<T>): Promise<Source & T> {
  const source: Source = { inputType: input.inputType, extractedText: input.extractedText };
  if (input.sourceUrl) source.sourceUrl = input.sourceUrl;
  if (input.sourceTitle) source.sourceTitle = input.sourceTitle;
  return { ...source, ...(await run(input.extractedText)) };
}

// The browser-supplied type can lie; trust the file's magic bytes. Returns null if it's not PNG/JPEG/WEBP.
export function sniffImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
