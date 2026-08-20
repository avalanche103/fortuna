import type { Request, Response, NextFunction } from 'express';
import { canonicalHost, shouldForceHttps } from '../config/env';

const SKIP_PREFIXES = ['/healthz'];

function hostnameOf(hostHeader: string): string {
  return hostHeader.split(':')[0].toLowerCase();
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

function shouldSkip(req: Request): boolean {
  return SKIP_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`));
}

export function canonicalRedirect(req: Request, res: Response, next: NextFunction): void {
  if (shouldSkip(req)) {
    next();
    return;
  }

  const hostHeader = req.get('host') || '';
  const host = hostnameOf(hostHeader);
  const forceHttps = shouldForceHttps();
  const wantHost = canonicalHost();

  if (forceHttps && !req.secure) {
    const targetHost = wantHost && !isLocalHost(host) ? wantHost : hostHeader;
    res.redirect(301, `https://${targetHost}${req.originalUrl}`);
    return;
  }

  if (wantHost && host && host !== hostnameOf(wantHost) && !isLocalHost(host)) {
    const protocol = forceHttps || req.secure ? 'https' : req.protocol;
    res.redirect(301, `${protocol}://${wantHost}${req.originalUrl}`);
    return;
  }

  if (req.path.length > 1 && req.path.endsWith('/')) {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(301, `${req.path.replace(/\/+$/, '')}${qs}`);
    return;
  }

  if (forceHttps && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}
