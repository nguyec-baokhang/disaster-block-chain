// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { getAuth0User } from "@/lib/admin-auth";
import { publicCheck } from "@/lib/checks";
import { getCheck } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/checks/[id]">) {
  await connection(); // reads local files — never prerender or cache
  const { id } = await ctx.params;
  const check = await getCheck(id);
  if (!check) return Response.json({ error: `Check not found: ${id}` }, { status: 404 });
  // `mine` lets the result page tell its owner where the check was saved, without exposing userId.
  const user = check.userId ? await getAuth0User() : null;
  return Response.json({ ...publicCheck(check), mine: Boolean(user?.sub && user.sub === check.userId) });
}
