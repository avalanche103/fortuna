import fs from 'fs';
import path from 'path';

const WEAK_SECRETS = new Set(['', 'fortuna-dev-secret-change-me', 'change-me-in-production']);

export function loadEnvFile(rootDir = process.cwd()): void {
  const envFile = path.join(rootDir, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

export const isProduction = process.env.NODE_ENV === 'production';

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || '';
  if (!WEAK_SECRETS.has(secret) && secret.length >= 24) return secret;
  if (isProduction) {
    throw new Error('SESSION_SECRET must be a strong random string (24+ chars) in production');
  }
  return 'fortuna-dev-secret-change-me';
}

export function assertProductionConfig(): void {
  if (!isProduction) return;
  getSessionSecret();
  if (!process.env.SITE_URL) {
    console.warn('SITE_URL is not set; set https://fcfortuna.by in production for canonical URLs and HTTPS redirects');
  }
}

export function getConfiguredSiteUrl(): string | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

export function resolveSiteUrl(protocol: string, host: string): string {
  return (getConfiguredSiteUrl() || `${protocol}://${host}`).replace(/\/$/, '');
}

export function shouldForceHttps(): boolean {
  const flag = process.env.FORCE_HTTPS?.trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  if (flag === '1' || flag === 'true' || flag === 'on') return true;
  const siteUrl = getConfiguredSiteUrl();
  if (siteUrl?.startsWith('https://')) return true;
  return false;
}

export function canonicalHost(): string | null {
  const siteUrl = getConfiguredSiteUrl();
  if (!siteUrl) return null;
  try {
    return new URL(siteUrl).host;
  } catch {
    return null;
  }
}

export const INDEXNOW_KEY = (process.env.INDEXNOW_KEY || 'fcfortuna-indexnow-8f3c2a1b').trim();
