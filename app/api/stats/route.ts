// No `runtime` export: Cache Components doesn't allow it, and Node.js is the default.
import { connection } from "next/server";
import { getCheckStats } from "@/lib/store";

export async function GET() {
  await connection(); // live numbers — never prerender or cache
  return Response.json(await getCheckStats());
}
