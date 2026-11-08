// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { readMemo } from "@/lib/solana";
import { getAlert } from "@/lib/store";
import { buildVerifyResult } from "@/lib/verify";

export async function GET(_req: Request, ctx: RouteContext<"/api/alerts/[id]/verify">) {
  await connection(); // reads local files and the chain — never prerender or cache
  const { id } = await ctx.params;

  const alert = await getAlert(id);
  if (!alert) return Response.json({ error: `Alert not found: ${id}` }, { status: 404 });
  if (!alert.signature) return Response.json(buildVerifyResult(alert, null));

  try {
    return Response.json(buildVerifyResult(alert, await readMemo(alert.signature)));
  } catch (err) {
    console.error(`readMemo failed for ${alert.id}:`, err);
    return Response.json({ error: "Could not read the transaction from Solana. Please try again." }, { status: 502 });
  }
}
