// Server-only: mirrors live National Weather Service alerts into CrisisSignal.
import { publishAlert } from "./publish";
import { listAlerts } from "./store";
import type { Alert } from "./types";

const NWS_AGENCY_ID = "nws-cin";
const USER_AGENT = "CrisisSignal-MakeUC (github.com/nguyec-baokhang/disaster-block-chain)";
const FETCH_TIMEOUT_MS = 15_000;

type NwsFeature = {
  id?: string;
  properties: {
    "@id"?: string;
    event?: string;
    headline?: string | null;
    description?: string | null;
    instruction?: string | null;
    areaDesc?: string;
    status?: string;
    messageType?: string;
  };
};

export type NwsImportResult = {
  areas: string[];   // the state codes we ended up pulling from
  found: number;     // active, real alerts in those areas
  skipped: number;   // already imported
  imported: Alert[];
};

export class NwsFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NwsFetchError";
  }
}

async function fetchActive(area: string): Promise<NwsFeature[]> {
  let res: Response;
  try {
    res = await fetch(`https://api.weather.gov/alerts/active?area=${area}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new NwsFetchError(`Couldn't reach weather.gov: ${(err as Error).message}`);
  }
  if (!res.ok) throw new NwsFetchError(`weather.gov returned ${res.status} for area=${area}`);
  const data = (await res.json()) as { features?: NwsFeature[] };
  // Only real, live messages: no tests, exercises, or cancellations.
  return (data.features ?? []).filter(
    (f) => f.properties.status === "Actual" && f.properties.messageType !== "Cancel",
  );
}

// NWS text is hard-wrapped at ~70 chars; join wrapped lines but keep paragraph breaks.
function unwrap(text: string | null | undefined): string {
  return (text ?? "").replace(/\r/g, "").replace(/([^\n])\n(?!\n)/g, "$1 ").trim();
}

const sourceUrlOf = (f: NwsFeature) => f.properties["@id"] ?? f.id;

let running: Promise<NwsImportResult> | null = null;

// Imports up to `limit` new alerts, Hamilton County first. Concurrent calls share one run.
export function importNwsAlerts(limit = 3): Promise<NwsImportResult> {
  running ??= run(limit).finally(() => {
    running = null;
  });
  return running;
}

async function run(limit: number): Promise<NwsImportResult> {
  let areas = ["OH"];
  let features = await fetchActive("OH");
  if (features.length === 0) {
    areas = ["KY", "IN"];
    features = (await Promise.all(areas.map(fetchActive))).flat();
  }

  // Already imported = an alert with this source that is confirmed or still pending.
  // Failed ones can be retried.
  const existing = new Set(
    (await listAlerts()).filter((a) => a.sourceUrl && a.chainStatus !== "failed").map((a) => a.sourceUrl),
  );

  const seen = new Set<string>();
  const fresh = features.filter((f) => {
    const url = sourceUrlOf(f);
    if (!url || existing.has(url) || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  const isHamilton = (f: NwsFeature) => /hamilton/i.test(f.properties.areaDesc ?? "");
  const picked = [...fresh.filter(isHamilton), ...fresh.filter((f) => !isHamilton(f))].slice(0, limit);

  // One at a time so each memo is confirmed before the next is sent.
  const imported: Alert[] = [];
  for (const f of picked) {
    const p = f.properties;
    const title = (p.headline || p.event || "NWS alert").trim();
    const body = [unwrap(p.description), unwrap(p.instruction)].filter(Boolean).join("\n\n");
    if (!body) continue;
    imported.push(await publishAlert({ agencyId: NWS_AGENCY_ID, title, body, sourceUrl: sourceUrlOf(f) }));
  }

  return { areas, found: features.length, skipped: features.length - fresh.length, imported };
}
