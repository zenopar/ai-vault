export class RateLimiter {
  private attempts: Map<string, { count: number; firstAttemptAt: number }> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number, windowMs: number) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000).unref();
  }

  isRateLimited(ip: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(ip);

    if (!record) {
      return false; // No previous attempts
    }

    if (now - record.firstAttemptAt > this.windowMs) {
      // Window expired, reset
      this.attempts.delete(ip);
      return false;
    }

    return record.count >= this.maxAttempts;
  }

  increment(ip: string): void {
    const now = Date.now();
    const record = this.attempts.get(ip);

    if (!record) {
      this.attempts.set(ip, { count: 1, firstAttemptAt: now });
      return;
    }

    if (now - record.firstAttemptAt > this.windowMs) {
      this.attempts.set(ip, { count: 1, firstAttemptAt: now });
      return;
    }

    record.count++;
  }

  reset(ip: string): void {
    this.attempts.delete(ip);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ip, record] of this.attempts.entries()) {
      if (now - record.firstAttemptAt > this.windowMs) {
        this.attempts.delete(ip);
      }
    }
  }
}

// 10 attempts per minute
export const authRateLimiter = new RateLimiter(10, 60 * 1000);
