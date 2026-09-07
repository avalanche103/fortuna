import db from '../db';
import { queryRow } from '../db/helpers';
import { YANDEX_METRIKA_ID } from './content';

const STAT_API = 'https://api-metrika.yandex.net/stat/v1/data';
const BYTIME_API = 'https://api-metrika.yandex.net/stat/v1/data/bytime';
const CACHE_MS = 5 * 60 * 1000;

export type YmPeriod = 'today' | '7d' | '30d';

export type YmTodayStats = {
  configured: boolean;
  error?: string;
  sessions: number;
  newUsers: number;
  users: number;
  pageViews: number;
};

export type YmNamedCount = { name: string; value: number };

export type YmDayPoint = { date: string; label: string; sessions: number; newUsers: number; pageViews: number };

export type YmReport = {
  configured: boolean;
  error?: string;
  period: YmPeriod;
  startDate: string;
  endDate: string;
  sessions: number;
  newUsers: number;
  users: number;
  pageViews: number;
  bounceRate: number;
  /** Средняя глубина просмотра (страниц за визит). */
  engagementRate: number;
  avgSessionSeconds: number;
  realtimeUsers: number | null;
  daily: YmDayPoint[];
  pages: YmNamedCount[];
  sources: YmNamedCount[];
  devices: YmNamedCount[];
  countries: YmNamedCount[];
};

type CacheEntry<T> = { expires: number; value: T };
type MetrikaTable = {
  data?: Array<{ dimensions?: Array<{ name?: string }>; metrics?: number[] }>;
  totals?: number[];
};
type MetrikaByTime = {
  time_intervals?: string[][];
  data?: Array<{ metrics?: number[][] }>;
};

const cache = new Map<string, CacheEntry<unknown>>();

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

export function getYmCounterId(): string {
  const fromEnv = process.env.YM_COUNTER_ID?.trim();
  if (fromEnv) return fromEnv.replace(/\D/g, '');
  const fromDb = readSetting('ym_counter_id').replace(/\D/g, '');
  return fromDb || YANDEX_METRIKA_ID;
}

export function getYmToken(): string {
  return (process.env.YM_OAUTH_TOKEN?.trim() || readSetting('ym_oauth_token')).trim();
}

export function saveYmToken(token: string): void {
  const cleaned = token.trim();
  if (!cleaned) throw new Error('Вставьте OAuth-токен Яндекса');
  upsertSetting('ym_oauth_token', cleaned);
  cache.clear();
}

export function clearYmToken(): void {
  upsertSetting('ym_oauth_token', '');
  cache.clear();
}

export function isYmConfigured(): boolean {
  return Boolean(getYmToken() && getYmCounterId());
}

export function tokenHint(): string {
  const token = getYmToken();
  if (!token) return '';
  if (token.length <= 12) return '••••••••';
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

function periodDates(period: YmPeriod): { startDate: string; endDate: string } {
  if (period === 'today') return { startDate: 'today', endDate: 'today' };
  if (period === '7d') return { startDate: '6daysAgo', endDate: 'today' };
  return { startDate: '29daysAgo', endDate: 'today' };
}

function formatDayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}`;
}

/** Метрика ограничивает параллельные запросы на один аккаунт — ходим строго по одному. */
let requestQueue: Promise<unknown> = Promise.resolve();

function enqueueYm<T>(task: () => Promise<T>): Promise<T> {
  const run = requestQueue.then(task, task);
  requestQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ymFetchOnce<T>(url: string): Promise<T> {
  const token = getYmToken();
  if (!token) throw new Error('Нет OAuth-токена Яндекс.Метрики');

  const res = await fetch(url, {
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string; errors?: Array<{ message?: string }> };
      detail = body.message || body.errors?.[0]?.message || '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('Токен недействителен или нет доступа к счётчику. Выпустите новый OAuth-токен с правом metrika:read.');
    }
    const err = new Error(detail || `Метрика API: HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return (await res.json()) as T;
}

async function ymFetch<T>(url: string): Promise<T> {
  return enqueueYm(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await ymFetchOnce<T>(url);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : '';
        const quota = /quota|parallel|concurrent|лимит|превышен/i.test(message);
        if (!quota || attempt === 3) break;
        await sleep(400 * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Не удалось загрузить Метрику');
  });
}

function buildUrl(base: string, params: Record<string, string | number>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) qs.set(key, String(value));
  return `${base}?${qs.toString()}`;
}

async function fetchTable(params: Record<string, string | number>): Promise<MetrikaTable> {
  return ymFetch<MetrikaTable>(buildUrl(STAT_API, { ids: getYmCounterId(), ...params }));
}

async function fetchByTime(params: Record<string, string | number>): Promise<MetrikaByTime> {
  return ymFetch<MetrikaByTime>(buildUrl(BYTIME_API, { ids: getYmCounterId(), group: 'day', ...params }));
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function namedRows(table: MetrikaTable, metricIndex = 0): YmNamedCount[] {
  return (table.data || [])
    .map((row) => ({
      name: row.dimensions?.[0]?.name?.trim() || '—',
      value: num(row.metrics?.[metricIndex]),
    }))
    .filter((row) => row.name && row.name !== '—');
}

function emptyToday(error?: string): YmTodayStats {
  return {
    configured: isYmConfigured(),
    error,
    sessions: 0,
    newUsers: 0,
    users: 0,
    pageViews: 0,
  };
}

function emptyReport(period: YmPeriod, error?: string): YmReport {
  const { startDate, endDate } = periodDates(period);
  return {
    configured: isYmConfigured(),
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

export async function getYmTodayStats(): Promise<YmTodayStats> {
  if (!isYmConfigured()) return emptyToday();
  const cached = getCached<YmTodayStats>('ym:today');
  if (cached) return cached;

  try {
    const table = await fetchTable({
      metrics: 'ym:s:visits,ym:s:newUsers,ym:s:users,ym:s:pageviews',
      date1: 'today',
      date2: 'today',
      accuracy: 'full',
    });
    const totals = table.totals || [];
    return setCached('ym:today', {
      configured: true,
      sessions: num(totals[0]),
      newUsers: num(totals[1]),
      users: num(totals[2]),
      pageViews: num(totals[3]),
    });
  } catch (error) {
    return emptyToday(error instanceof Error ? error.message : 'Не удалось загрузить аналитику');
  }
}

export async function getYmReport(period: YmPeriod): Promise<YmReport> {
  if (!isYmConfigured()) return emptyReport(period);
  const cacheKey = `ym:report:${period}`;
  const cached = getCached<YmReport>(cacheKey);
  if (cached) return cached;

  const { startDate, endDate } = periodDates(period);
  const range = { date1: startDate, date2: endDate, accuracy: 'full' as const };

  try {
    // Только последовательно: у Метрики жёсткий лимит параллельных запросов на аккаунт.
    const totals = await fetchTable({
      ...range,
      metrics:
        'ym:s:visits,ym:s:newUsers,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgPageViews,ym:s:avgVisitDurationSeconds',
    });
    const daily = await fetchByTime({
      ...range,
      metrics: 'ym:s:visits,ym:s:newUsers,ym:s:pageviews',
    });
    const pages = await fetchTable({
      ...range,
      dimensions: 'ym:s:startURLPath',
      metrics: 'ym:s:pageviews',
      sort: '-ym:s:pageviews',
      limit: 12,
    });
    const sources = await fetchTable({
      ...range,
      dimensions: 'ym:s:lastTrafficSource',
      metrics: 'ym:s:visits',
      sort: '-ym:s:visits',
      limit: 10,
    });
    const devices = await fetchTable({
      ...range,
      dimensions: 'ym:s:deviceCategory',
      metrics: 'ym:s:visits',
      sort: '-ym:s:visits',
    });
    const countries = await fetchTable({
      ...range,
      dimensions: 'ym:s:regionCountry',
      metrics: 'ym:s:visits',
      sort: '-ym:s:visits',
      limit: 8,
    });

    const t = totals.totals || [];
    const visitsSeries = daily.data?.[0]?.metrics?.[0] || [];
    const newUsersSeries = daily.data?.[0]?.metrics?.[1] || [];
    const pageViewsSeries = daily.data?.[0]?.metrics?.[2] || [];
    const intervals = daily.time_intervals || [];

    const report: YmReport = {
      configured: true,
      period,
      startDate,
      endDate,
      sessions: num(t[0]),
      newUsers: num(t[1]),
      users: num(t[2]),
      pageViews: num(t[3]),
      bounceRate: num(t[4]),
      engagementRate: num(t[5]),
      avgSessionSeconds: num(t[6]),
      realtimeUsers: null,
      daily: intervals.map((interval, index) => {
        const date = interval?.[0] || '';
        return {
          date,
          label: formatDayLabel(date),
          sessions: num(visitsSeries[index]),
          newUsers: num(newUsersSeries[index]),
          pageViews: num(pageViewsSeries[index]),
        };
      }),
      pages: namedRows(pages),
      sources: namedRows(sources),
      devices: namedRows(devices),
      countries: namedRows(countries),
    };
    return setCached(cacheKey, report);
  } catch (error) {
    return emptyReport(period, error instanceof Error ? error.message : 'Не удалось загрузить аналитику');
  }
}

export function parsePeriod(value: unknown): YmPeriod {
  if (value === 'today' || value === '7d' || value === '30d') return value;
  return '7d';
}

export function formatYmNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

export function formatYmPercent(value: number): string {
  // Метрика отдаёт отказы в процентах (0–100).
  return `${value.toFixed(1).replace('.', ',')}%`;
}

export function formatYmDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins === 0) return `${secs} с`;
  return `${mins} мин ${secs.toString().padStart(2, '0')} с`;
}

/** Глубина просмотра — страниц за визит. */
export function formatYmDepth(value: number): string {
  return value.toFixed(1).replace('.', ',');
}
