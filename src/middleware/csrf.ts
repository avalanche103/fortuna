import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getConfiguredSiteUrl } from '../config/env';

function allowedOrigins(req: Request): Set<string> {
  const host = req.get('host') || '';
  const origins = new Set([`https://${host}`, `http://${host}`]);
  const siteUrl = getConfiguredSiteUrl();
  if (siteUrl) {
    try {
      origins.add(new URL(siteUrl).origin);
    } catch {
      /* ignore */
    }
  }
  return origins;
}

function requestOrigin(req: Request): string | null {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

export function attachCsrfToken(req: Request, res: Response, next: NextFunction): void {
  res.locals.csrfToken = ensureCsrfToken(req);
  next();
}

function tokensMatch(expected: string, provided: unknown): boolean {
  const value = typeof provided === 'string' ? provided : '';
  if (!value || value.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(value));
  } catch {
    return false;
  }
}

export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next();
    return;
  }
  if (!req.path.startsWith('/admin')) {
    next();
    return;
  }

  const expected = ensureCsrfToken(req);
  const origin = requestOrigin(req);
  const originOk = origin ? allowedOrigins(req).has(origin) : false;
  const token =
    req.get('x-csrf-token') ||
    (typeof req.body === 'object' && req.body ? (req.body as { _csrf?: string })._csrf : undefined);
  const tokenOk = tokensMatch(expected, token);

  if (tokenOk || originOk) {
    next();
    return;
  }

  res.status(403).type('text/plain').send('Forbidden');
}
