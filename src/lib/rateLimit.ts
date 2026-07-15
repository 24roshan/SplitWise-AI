/**
 * Minimal in-memory rate limiter to slow down credential-stuffing / brute
 * force attempts against auth endpoints.
 *
 * NOTE: this resets on every server restart and doesn't share state across
 * multiple server instances. Fine for a single-instance demo deployment;
 * swap for a Redis-backed limiter (e.g. Upstash) before running this behind
 * more than one instance in production.
 */

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  { max = 5, windowMs = 60_000 }: { max?: number; windowMs?: number } = {}
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: max - entry.count };
}
