// Normalizes Gemini's extracted claims to one "- claim" per line. Safe to import from client components
// (the result page also tidies checks stored before this existed).

const BULLETS = /^(?:[-*•–—]\s*|\d+[.)]\s+)+/; // "- - ", "* - ", "1. - ", "•"
const LABEL = /^\s*([A-Za-z][A-Za-z /()]{0,40}):\s*/;
const EMPTY = /^(?:not stated|unknown|none|n\/a|unspecified)\.?$/i;

// "Who: EMA; What: water safe; Where: Not stated" → "EMA, water safe"
function unlabel(line: string): string {
  const parts = line.split(/\s*;\s*/);
  if (parts.length < 2 || !parts.every((p) => LABEL.test(p))) return line;
  return parts
    .map((p) => p.replace(LABEL, "").trim())
    .filter((v) => v && !EMPTY.test(v))
    .join(", ");
}

export function tidyClaims(text: string): string {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const body = unlabel(raw.trim().replace(BULLETS, "").trim());
    if (!body || EMPTY.test(body)) continue;
    const from = body.match(/^shown as from:\s*(.*)$/i);
    if (from) {
      if (from[1] && !EMPTY.test(from[1])) lines.push(`Shown as from: ${from[1]}`);
      continue;
    }
    if (!lines.includes(`- ${body}`)) lines.push(`- ${body}`);
  }
  return lines.join("\n");
}
