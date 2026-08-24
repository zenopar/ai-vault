// In-memory rate limiter for Next.js App Router (Server Actions / API Routes)
// Suitable for single-instance deployments (standard for self-hosted tools).

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Brute-force protection map
const bruteForceMap = new Map<string, { failures: number; lockedUntil: number }>();

// Cleanup interval to prevent memory leaks from the Maps
setInterval(() => {
  const now = Date.now();
  
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(ip);
    }
  }

  for (const [ip, record] of bruteForceMap.entries()) {
    // If not locked and hasn't failed recently, or lock has expired a long time ago, we could clean it.
    // We'll clean it up if it's been expired for more than 1 hour to prevent indefinite memory growth.
    if (now > record.lockedUntil + 60 * 60 * 1000) {
      bruteForceMap.delete(ip);
    }
  }
}, 60 * 1000).unref();

/**
 * Checks if a given IP has exceeded the generic rate limit.
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

/**
 * Checks if the IP is currently locked out due to brute force attempts.
 * Returns the remaining lockout time in milliseconds, or 0 if not locked.
 */
export function checkBruteForceLock(ip: string): number {
  const now = Date.now();
  const record = bruteForceMap.get(ip);
  
  if (!record) {
    return 0;
  }

  if (now < record.lockedUntil) {
    return record.lockedUntil - now;
  }

  return 0;
}

/**
 * Records a failed attempt and calculates the progressive delay.
 */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = bruteForceMap.get(ip) || { failures: 0, lockedUntil: 0 };
  
  record.failures += 1;
  
  // Progressive delay: 2^failures seconds, up to 1 hour (3600 seconds)
  // 1st = 2s, 2nd = 4s, 3rd = 8s, 4th = 16s...
  const delaySeconds = Math.min(Math.pow(2, record.failures), 3600);
  record.lockedUntil = now + delaySeconds * 1000;
  
  bruteForceMap.set(ip, record);
}

/**
 * Clears the failed attempts counter upon a successful action.
 */
export function clearFailedAttempts(ip: string): void {
  bruteForceMap.delete(ip);
}
