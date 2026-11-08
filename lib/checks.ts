// Who ran a check. Owner fields are private: only /my-checks shows them, never public responses.
import { redact } from "./redact";
import { filterSources, isFirstPerson } from "./sources";
import type { CheckResult } from "./types";

export type CheckOwner = { sub?: string; email?: string } | null;

// Anonymous checks (no login, or Auth0 off) get no owner fields at all.
export function ownerFields(user: CheckOwner): Pick<CheckResult, "userId" | "userEmail"> {
  if (!user?.sub) return {};
  return { userId: user.sub, ...(user.email ? { userEmail: user.email } : {}) };
}

// /result/[id] and /api/checks/[id] are public and check IDs are sequential, so strip the owner and
// hide contact details pasted into the input. The stored check is untouched (the on-chain log hashes it).
export function publicCheck(check: CheckResult): CheckResult {
  const rest = { ...check };
  delete rest.userId;
  delete rest.userEmail;
  if (rest.inputText) rest.inputText = redact(rest.inputText);
  if (rest.inputTranscript) rest.inputTranscript = redact(rest.inputTranscript);
  if (rest.extractedText) rest.extractedText = redact(rest.extractedText);
  // Older checks were saved before these display rules existed.
  rest.sources = filterSources(rest.sources);
  rest.limitations = rest.limitations.filter((l) => !isFirstPerson(l));
  return rest;
}

// A user's own checks, newest first. Never matches anonymous checks.
export function checksForUser(checks: CheckResult[], userId: string): CheckResult[] {
  if (!userId) return [];
  return checks.filter((c) => c.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
