import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../paths';
import db from '../db';
import { queryRow } from '../db/helpers';

const execFileAsync = promisify(execFile);

export const GA_MEASUREMENT_ID = 'G-NJBSZ9CSXV';
export const GA_CREDENTIALS_PATH = path.join(DATA_DIR, 'ga-credentials.json');
export const GA_IMPERSONATE_SA =
  process.env.GA_IMPERSONATE_SA?.trim() ||
  'fortuna-analytics@project-80637aeb-8be5-49c5-aca.iam.gserviceaccount.com';

const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta';
const CACHE_MS = 5 * 60 * 1000;

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type UserCredentials = {
  client_id: string;
  client_secret: string;
  refresh_token: string;
};

type GaCredentials = { kind: 'service_account'; account: ServiceAccount } | { kind: 'user'; user: UserCredentials };

export type GaTodayStats = {
  configured: boolean;
  error?: string;
  sessions: number;
  newUsers: number;
  users: number;
  pageViews: number;
};

export type GaNamedCount = { name: string; value: number };

export type GaDayPoint = { date: string; label: string; sessions: number; newUsers: number; pageViews: number };

export type GaReport = {
  configured: boolean;
  error?: string;
  period: GaPeriod;
  startDate: string;
  endDate: string;
  sessions: number;
  newUsers: number;
  users: number;
  pageViews: number;
  bounceRate: number;
  engagementRate: number;
  avgSessionSeconds: number;
  realtimeUsers: number | null;
  daily: GaDayPoint[];
  pages: GaNamedCount[];
  sources: GaNamedCount[];
  devices: GaNamedCount[];
  countries: GaNamedCount[];
};

export type GaPeriod = 'today' | '7d' | '30d';

type CacheEntry<T> = { expires: number; value: T };

const cache = new Map<string, CacheEntry<unknown>>();
let tokenCache: { token: string; expires: number } | null = null;
let discoveredPropertyId: string | null = null;

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry || entry.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached<T>(key: string, value: T, ttl = CACHE_MS): T {
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
}

function readSetting(key: string): string {
  return queryRow<{ value: string }>(db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key))?.value ?? '';
}

export function upsertSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

function credentialPaths(): string[] {
  const homeGcloud = path.join(process.env.HOME || process.env.USERPROFILE || '', '.config', 'gcloud');
  const appDataGcloud = process.env.APPDATA ? path.join(process.env.APPDATA, 'gcloud') : '';
  const files = [
    process.env.GA_SERVICE_ACCOUNT_FILE?.trim() || '',
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || '',
    GA_CREDENTIALS_PATH,
    path.join(appDataGcloud, 'application_default_credentials.json'),
    path.join(homeGcloud, 'application_default_credentials.json'),
  ];
  for (const base of [appDataGcloud, homeGcloud].filter(Boolean)) {
    const legacy = path.join(base, 'legacy_credentials');
    if (!fs.existsSync(legacy)) continue;
    for (const dir of fs.readdirSync(legacy)) {
      files.push(path.join(legacy, dir, 'adc.json'));
    }
  }
  return files.filter(Boolean);
}

export function loadGaCredentials(): GaCredentials | null {
  const fromEnv = process.env.GA_SERVICE_ACCOUNT_JSON?.trim();
  if (fromEnv) {
    try {
      return parseGaCredentials(fromEnv);
    } catch {
      return null;
    }
  }
  for (const filePath of credentialPaths()) {
    if (!fs.existsSync(filePath)) continue;
    try {
      return parseGaCredentials(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
  }
  return null;
}

function parseGaCredentials(raw: string): GaCredentials {
  const parsed = JSON.parse(raw) as {
    type?: string;
    client_email?: string;
    private_key?: string;
    client_id?: string;
    client_secret?: string;
    refresh_token?: string;
  };
  if (parsed.client_email && parsed.private_key) {
    return {
      kind: 'service_account',
      account: {
        client_email: parsed.client_email,
        private_key: parsed.private_key.replace(/\\n/g, '\n'),
      },
    };
  }
  if (parsed.client_id && parsed.client_secret && parsed.refresh_token) {
    return {
      kind: 'user',
      user: {
        client_id: parsed.client_id,
        client_secret: parsed.client_secret,
        refresh_token: parsed.refresh_token,
      },
    };
  }
  throw new Error('Нужен JSON сервисного аккаунта или OAuth (refresh_token)');
}

export function loadServiceAccount(): ServiceAccount | null {
  const creds = loadGaCredentials();
  return creds?.kind === 'service_account' ? creds.account : null;
}

export function saveServiceAccountJson(raw: string): void {
  const creds = parseGaCredentials(raw);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const payload =
    creds.kind === 'service_account'
      ? { type: 'service_account', client_email: creds.account.client_email, private_key: creds.account.private_key }
      : {
          type: 'authorized_user',
          client_id: creds.user.client_id,
          client_secret: creds.user.client_secret,
          refresh_token: creds.user.refresh_token,
        };
  fs.writeFileSync(GA_CREDENTIALS_PATH, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
  tokenCache = null;
  cache.clear();
  discoveredPropertyId = null;
}

export function hasStoredCredentials(): boolean {
  return Boolean(loadGaCredentials());
}

export function credentialsEmail(): string | null {
  if (GA_IMPERSONATE_SA) return GA_IMPERSONATE_SA;
  const creds = loadGaCredentials();
  if (!creds) return null;
  return creds.kind === 'service_account' ? creds.account.client_email : 'Google-аккаунт (OAuth)';
}

export function normalizePropertyId(value: string | null | undefined): string {
  const digits = String(value || '').replace(/^properties\//, '').replace(/\D/g, '');
  return digits;
}

export function getStoredPropertyId(): string {
  return normalizePropertyId(process.env.GA_PROPERTY_ID || readSetting('ga_property_id'));
}

export function savePropertyId(value: string): void {
  upsertSetting('ga_property_id', normalizePropertyId(value));
  cache.clear();
}

function createSignedJwt(account: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: GA_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  return `${unsigned}.${signer.sign(account.private_key, 'base64url')}`;
}

async function refreshUserToken(user: UserCredentials): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: user.client_id,
      client_secret: user.client_secret,
      refresh_token: user.refresh_token,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error || 'Не удалось обновить OAuth-токен Google');
  }
  return data.access_token;
}

async function jwtAccessToken(account: ServiceAccount): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createSignedJwt(account),
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error || 'Не удалось получить токен Google');
  }
  return data.access_token;
}

async function metadataAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(1500) }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { access_token?: string };
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function gcloudAccessToken(): Promise<string | null> {
  const bin = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  try {
    const { stdout } = await execFileAsync(bin, ['auth', 'print-access-token'], {
      timeout: 20000,
      windowsHide: true,
    });
    const token = stdout.trim().split(/\s+/)[0];
    return token || null;
  } catch {
    return null;
  }
}

async function getCloudPlatformToken(): Promise<string> {
  const creds = loadGaCredentials();
  if (creds?.kind === 'user') return refreshUserToken(creds.user);
  const fromMetadata = await metadataAccessToken();
  if (fromMetadata) return fromMetadata;
  const fromGcloud = await gcloudAccessToken();
  if (fromGcloud) return fromGcloud;
  throw new Error('Не найден вход gcloud. Выполните: gcloud auth login');
}

async function impersonateAnalyticsToken(cloudToken: string): Promise<string> {
  const response = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(GA_IMPERSONATE_SA)}:generateAccessToken`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cloudToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: [GA_SCOPE],
        lifetime: '3600s',
      }),
      signal: AbortSignal.timeout(10000),
    }
  );
  const data = (await response.json()) as { accessToken?: string; expireTime?: string; error?: { message?: string } };
  if (!response.ok || !data.accessToken) {
    throw new Error(
      data.error?.message ||
        `Не удалось выпустить токен для ${GA_IMPERSONATE_SA}. Нужна роль Service Account Token Creator.`
    );
  }
  return data.accessToken;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 30_000) return tokenCache.token;
  const creds = loadGaCredentials();
  if (creds?.kind === 'service_account') {
    const token = await jwtAccessToken(creds.account);
    tokenCache = { token, expires: Date.now() + 48 * 60 * 1000 };
    return token;
  }
  const cloudToken = await getCloudPlatformToken();
  const token = GA_IMPERSONATE_SA ? await impersonateAnalyticsToken(cloudToken) : cloudToken;
  tokenCache = { token, expires: Date.now() + 48 * 60 * 1000 };
  return token;
}

async function gaFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(12000),
  });
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message || `Ошибка Google Analytics (${response.status})`);
  }
  return data;
}

async function discoverPropertyId(): Promise<string> {
  if (discoveredPropertyId) return discoveredPropertyId;
  const summaries = await gaFetch<{
    accountSummaries?: Array<{
      propertySummaries?: Array<{ property?: string }>;
    }>;
  }>(`${ADMIN_API}/accountSummaries`);

  const propertyIds =
    summaries.accountSummaries?.flatMap((account) =>
      (account.propertySummaries || []).map((item) => String(item.property || '').replace(/^properties\//, ''))
    ) || [];

  for (const id of propertyIds.filter(Boolean)) {
    const streams = await gaFetch<{
      dataStreams?: Array<{ webStreamData?: { measurementId?: string } }>;
    }>(`${ADMIN_API}/properties/${id}/dataStreams`);
    const match = streams.dataStreams?.some((stream) => stream.webStreamData?.measurementId === GA_MEASUREMENT_ID);
    if (match) {
      discoveredPropertyId = id;
      if (!getStoredPropertyId()) savePropertyId(id);
      return id;
    }
  }

  if (propertyIds.length === 1) {
    discoveredPropertyId = propertyIds[0];
    return propertyIds[0];
  }

  throw new Error('Укажите ID ресурса GA4 (Admin → Сведения о ресурсе)');
}

async function resolvePropertyId(): Promise<string> {
  const stored = getStoredPropertyId();
  if (stored) return stored;
  return discoverPropertyId();
}

export function isGaConfigured(): boolean {
  return Boolean(loadGaCredentials() || GA_IMPERSONATE_SA);
}

type GaReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
  totals?: Array<{ metricValues?: Array<{ value?: string }> }>;
};

function metricNum(row: { metricValues?: Array<{ value?: string }> } | undefined, index: number): number {
  const raw = row?.metricValues?.[index]?.value;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function emptyToday(error?: string): GaTodayStats {
  return { configured: isGaConfigured(), error, sessions: 0, newUsers: 0, users: 0, pageViews: 0 };
}

function periodDates(period: GaPeriod): { startDate: string; endDate: string } {
  if (period === 'today') return { startDate: 'today', endDate: 'today' };
  if (period === '7d') return { startDate: '7daysAgo', endDate: 'today' };
  return { startDate: '30daysAgo', endDate: 'today' };
}

async function runReport(body: Record<string, unknown>): Promise<GaReportResponse> {
  const propertyId = await resolvePropertyId();
  return gaFetch<GaReportResponse>(`${DATA_API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function runRealtime(body: Record<string, unknown>): Promise<GaReportResponse> {
  const propertyId = await resolvePropertyId();
  return gaFetch<GaReportResponse>(`${DATA_API}/properties/${propertyId}:runRealtimeReport`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getGaTodayStats(): Promise<GaTodayStats> {
  if (!isGaConfigured()) return emptyToday();
  const cached = getCached<GaTodayStats>('today');
  if (cached) return cached;

  try {
    const report = await runReport({
      dateRanges: [{ startDate: 'today', endDate: 'today' }],
      metrics: [
        { name: 'sessions' },
        { name: 'newUsers' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
      ],
    });
    const row = report.rows?.[0] || report.totals?.[0];
    return setCached('today', {
      configured: true,
      sessions: metricNum(row, 0),
      newUsers: metricNum(row, 1),
      users: metricNum(row, 2),
      pageViews: metricNum(row, 3),
    });
  } catch (error) {
    return emptyToday(error instanceof Error ? error.message : 'Не удалось загрузить аналитику');
  }
}

function formatDayLabel(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}.${yyyymmdd.slice(4, 6)}`;
}

function namedRows(report: GaReportResponse, metricIndex = 0): GaNamedCount[] {
  return (report.rows || [])
    .map((row) => ({
      name: row.dimensionValues?.[0]?.value || '—',
      value: metricNum(row, metricIndex),
    }))
    .filter((row) => row.name && row.name !== '(not set)');
}

function emptyReport(period: GaPeriod, error?: string): GaReport {
  const { startDate, endDate } = periodDates(period);
  return {
    configured: isGaConfigured(),
    error,
    period,
    startDate,
    endDate,
    sessions: 0,
    newUsers: 0,
    users: 0,
    pageViews: 0,
    bounceRate: 0,
    engagementRate: 0,
    avgSessionSeconds: 0,
    realtimeUsers: null,
    daily: [],
    pages: [],
    sources: [],
    devices: [],
    countries: [],
  };
}

export async function getGaReport(period: GaPeriod): Promise<GaReport> {
  if (!isGaConfigured()) return emptyReport(period);
  const cacheKey = `report:${period}`;
  const cached = getCached<GaReport>(cacheKey);
  if (cached) return cached;

  const { startDate, endDate } = periodDates(period);
  const dateRanges = [{ startDate, endDate }];
  const orderDesc = [{ metric: { metricName: 'sessions' }, desc: true }];

  try {
    const [totals, daily, pages, sources, devices, countries, realtime] = await Promise.all([
      runReport({
        dateRanges,
        metrics: [
          { name: 'sessions' },
          { name: 'newUsers' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'engagementRate' },
          { name: 'averageSessionDuration' },
        ],
      }),
      runReport({
        dateRanges,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'newUsers' }, { name: 'screenPageViews' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      runReport({
        dateRanges,
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 12,
      }),
      runReport({
        dateRanges,
        dimensions: [{ name: 'sessionSource' }],
        metrics: [{ name: 'sessions' }],
        orderBys: orderDesc,
        limit: 10,
      }),
      runReport({
        dateRanges,
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }],
        orderBys: orderDesc,
      }),
      runReport({
        dateRanges,
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'sessions' }],
        orderBys: orderDesc,
        limit: 8,
      }),
      runRealtime({ metrics: [{ name: 'activeUsers' }] }).catch(() => null),
    ]);

    const row = totals.rows?.[0] || totals.totals?.[0];
    const report: GaReport = {
      configured: true,
      period,
      startDate,
      endDate,
      sessions: metricNum(row, 0),
      newUsers: metricNum(row, 1),
      users: metricNum(row, 2),
      pageViews: metricNum(row, 3),
      bounceRate: metricNum(row, 4),
      engagementRate: metricNum(row, 5),
      avgSessionSeconds: metricNum(row, 6),
      realtimeUsers: realtime ? metricNum(realtime.rows?.[0] || realtime.totals?.[0], 0) : null,
      daily: (daily.rows || []).map((item) => ({
        date: item.dimensionValues?.[0]?.value || '',
        label: formatDayLabel(item.dimensionValues?.[0]?.value || ''),
        sessions: metricNum(item, 0),
        newUsers: metricNum(item, 1),
        pageViews: metricNum(item, 2),
      })),
      pages: namedRows(pages, 0),
      sources: namedRows(sources),
      devices: namedRows(devices),
      countries: namedRows(countries),
    };
    return setCached(cacheKey, report);
  } catch (error) {
    return emptyReport(period, error instanceof Error ? error.message : 'Не удалось загрузить аналитику');
  }
}

export function parsePeriod(value: unknown): GaPeriod {
  if (value === 'today' || value === '7d' || value === '30d') return value;
  return '7d';
}

export function formatGaNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

export function formatGaPercent(value: number): string {
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(1).replace('.', ',')}%`;
}

export function formatGaDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins === 0) return `${secs} с`;
  return `${mins} мин ${secs.toString().padStart(2, '0')} с`;
}
