// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { verifyCheck } from "@/lib/check-log";
import { getCheck } from "@/lib/store";

// Public: re-hashes the stored check and compares it with the memo on Solana.
export async function GET(_req: Request, ctx: RouteContext<"/api/checks/[id]/verify">) {
  await connection(); // reads the store and the chain — never prerender or cache
  const { id } = await ctx.params;
  const check = await getCheck(id);
  if (!check) return Response.json({ error: `Check not found: ${id}` }, { status: 404 });
  if (!check.chainSignature) return Response.json({ error: "This check hasn't been logged on Solana." }, { status: 409 });
  try {
    return Response.json(await verifyCheck(check));
  } catch (err) {
    console.error(`check verify failed for ${id}:`, err);
    return Response.json({ error: "Could not read the transaction from Solana. Please try again." }, { status: 502 });
  }
}
