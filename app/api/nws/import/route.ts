// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { requireAdmin } from "@/lib/admin";
import { NwsFetchError, importNwsAlerts } from "@/lib/nws";
import { PublishError } from "@/lib/publish";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await importNwsAlerts());
  } catch (err) {
    console.error("NWS import failed:", err);
    if (err instanceof NwsFetchError) return Response.json({ error: err.message }, { status: 502 });
    if (err instanceof PublishError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: `Import failed: ${(err as Error).message}` }, { status: 500 });
  }
}
