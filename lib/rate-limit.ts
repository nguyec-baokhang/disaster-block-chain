// In-memory sliding-window rate limiter. Per server process, which is fine for a single-instance demo;
// a multi-instance deploy would need a shared store.

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(readonly limit: number, readonly windowMs: number) {}

  // Records an attempt for `key`. ok=false means over the limit; retryAfterSec says when to try again.
  hit(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(since);
    return { ok: true, retryAfterSec: 0 };
  }

  private prune(since: number) {
    for (const [key, times] of this.hits) if (!times.some((t) => t > since)) this.hits.delete(key);
  }
}

// POST /api/check: 10 checks per user per minute.
export const checkLimiter = new RateLimiter(10, 60_000);
