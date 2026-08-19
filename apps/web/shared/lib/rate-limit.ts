// In-memory rate limiter for Next.js App Router (Server Actions / API Routes)
// Suitable for single-instance deployments (standard for self-hosted tools).

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Cleanup interval to prevent memory leaks from the Map
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 60 * 1000).unref();

/**
 * Checks if a given IP has exceeded the rate limit.
 * @param ip The client IP address
 * @param maxRequests Maximum allowed requests in the window
 * @param windowMs Time window in milliseconds
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count += 1;
  return true;
}
