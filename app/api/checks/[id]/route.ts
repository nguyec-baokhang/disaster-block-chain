// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { publicCheck } from "@/lib/checks";
import { getCheck } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/checks/[id]">) {
  await connection(); // reads local files — never prerender or cache
  const { id } = await ctx.params;
  const check = await getCheck(id);
  if (!check) return Response.json({ error: `Check not found: ${id}` }, { status: 404 });
  return Response.json(publicCheck(check));
}
