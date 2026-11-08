// Calls Gemini with the same request groundedCheck makes and prints the raw result.
// Usage: npx tsx --env-file=.env.local scripts/diag-grounding.ts [--list-models]
import { GoogleGenAI } from "@google/genai";

const TEXT = "Breaking: FEMA confirms a 7.0 earthquake hit Cincinnati this morning.";

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1beta", retryOptions: { attempts: 1 } } });

  if (process.argv.includes("--list-models")) {
    for await (const m of await ai.models.list()) {
      if (m.name?.includes("flash")) console.log(m.name, "|", m.supportedActions?.join(","));
    }
    return;
  }

  const model = process.env.GEMINI_MODEL;
  console.log("GEMINI_MODEL =", JSON.stringify(model));
  if (!model) throw new Error("Missing GEMINI_MODEL");

  const started = Date.now();
  try {
    const res = await ai.models.generateContent({
      model,
      contents: `Fact-check this message using Google Search. Respond with ONLY a JSON object {"verdict","summary","redFlags","limitations"}.\n\n${TEXT}`,
      config: { tools: [{ googleSearch: {} }], abortSignal: AbortSignal.timeout(25_000) },
    });
    const meta = res.candidates?.[0]?.groundingMetadata;
    console.log(`OK in ${Date.now() - started} ms`);
    console.log("text:", res.text);
    console.log("finishReason:", res.candidates?.[0]?.finishReason);
    console.log("webSearchQueries:", meta?.webSearchQueries);
    console.log("groundingChunks:", JSON.stringify(meta?.groundingChunks?.map((c) => c.web), null, 2));
  } catch (err) {
    console.log(`FAILED after ${Date.now() - started} ms`);
    console.dir(err, { depth: 6 });
  }
}

main();
