import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getConfiguredSiteUrl } from '../config/env';

function hostnameOf(hostHeader: string): string {
  return hostHeader.split(':')[0].toLowerCase();
}

function allowedOrigins(req: Request): Set<string> {
  const host = hostnameOf(req.get('host') || '');
  const origins = new Set<string>();
  if (host) {
    origins.add(`https://${host}`);
    origins.add(`http://${host}`);
  }
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

function requestCsrfToken(req: Request): unknown {
  const header = req.get('x-csrf-token');
  if (header) return header;
  const query = req.query?._csrf;
  if (typeof query === 'string') return query;
  if (Array.isArray(query) && typeof query[0] === 'string') return query[0];
  if (typeof req.body === 'object' && req.body) {
    return (req.body as { _csrf?: string })._csrf;
  }
  return undefined;
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
  const tokenOk = tokensMatch(expected, requestCsrfToken(req));

  if (tokenOk || originOk) {
    next();
    return;
  }

  const wantsJson =
    req.path.includes('/upload') ||
    String(req.get('accept') || '').includes('application/json') ||
    String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
  if (wantsJson) {
    res.status(403).json({ error: 'Сессия устарела — обновите страницу и войдите снова' });
    return;
  }
  res.status(403).type('text/plain').send('Forbidden');
}
