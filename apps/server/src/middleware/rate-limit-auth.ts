import type { NextFunction, Request, Response } from "express";

export type RateLimiter = {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  reset(): void;
};

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  now?: () => number;
}): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const now = options.now ?? (() => Date.now());

  function clientKey(req: Request): string {
    return req.ip || req.socket.remoteAddress || "unknown";
  }

  return {
    reset() {
      hits.clear();
    },
    middleware(req, res, next) {
      const key = clientKey(req);
      const current = now();
      const existing = hits.get(key);

      if (!existing || existing.resetAt <= current) {
        hits.set(key, { count: 1, resetAt: current + options.windowMs });
        next();
        return;
      }

      if (existing.count >= options.max) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }

      existing.count += 1;
      next();
    },
  };
}
