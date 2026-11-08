// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { requireAdmin } from "@/lib/admin";
import { PublishError, retryAlert } from "@/lib/publish";

export async function POST(request: Request, ctx: RouteContext<"/api/alerts/[id]/retry">) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    return Response.json(await retryAlert(id));
  } catch (err) {
    if (err instanceof PublishError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
