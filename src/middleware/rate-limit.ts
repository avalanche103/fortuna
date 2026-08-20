import type { Request, Response, NextFunction } from 'express';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function prune(now: number): void {
  if (buckets.size < 200) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  prune(now);
  const key = `login:${clientKey(req)}`;
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }
  existing.count += 1;
  if (existing.count > MAX_ATTEMPTS) {
    res.status(429).render('admin/login', {
      title: 'Вход',
      error: 'Слишком много попыток. Подождите 15 минут.',
    });
    return;
  }
  next();
}

export function clearLoginAttempts(req: Request): void {
  buckets.delete(`login:${clientKey(req)}`);
}
