// Who ran a check. Owner fields are private: only /my-checks shows them, never public responses.
import type { CheckResult } from "./types";

export type CheckOwner = { sub?: string; email?: string } | null;

// Anonymous checks (no login, or Auth0 off) get no owner fields at all.
export function ownerFields(user: CheckOwner): Pick<CheckResult, "userId" | "userEmail"> {
  if (!user?.sub) return {};
  return { userId: user.sub, ...(user.email ? { userEmail: user.email } : {}) };
}

// /result/[id] and /api/checks/[id] are public and check IDs are sequential, so strip the owner.
export function publicCheck(check: CheckResult): CheckResult {
  const rest = { ...check };
  delete rest.userId;
  delete rest.userEmail;
  return rest;
}

// A user's own checks, newest first. Never matches anonymous checks.
export function checksForUser(checks: CheckResult[], userId: string): CheckResult[] {
  if (!userId) return [];
  return checks.filter((c) => c.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
