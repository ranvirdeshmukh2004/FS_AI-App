import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Small fixed-window limiter. Deliberately dependency-free and in-memory:
 * the free tiers this deploys to run a single instance, so a shared store
 * would be more moving parts than the problem warrants. It exists to stop
 * a stranger burning through a visitor's tokens, not to survive a botnet.
 */
export function rateLimit(opts: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  // Keep the map from growing without bound on a long-lived process.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, opts.windowMs);
  sweep.unref();

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    // Render and Vercel sit behind proxies, so prefer the forwarded address.
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim()) ||
      req.socket.remoteAddress ||
      "unknown";

    const now = Date.now();
    const bucket = buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: `Too many requests. Try again in ${retryAfter}s.`,
      });
      return;
    }

    next();
  };
}
