export const BASE = 'https://fcfortuna.by';

export const GROUP_BY_TITLE: Record<string, string> = {
  'ФОРТУНА-1 (2013-2014)': 'fortuna-1-2013-2014',
  'ФОРТУНА-2 (2015-2016)': 'fortuna-2-2015-2016',
  'ФОРТУНА-3 (2017-2018)': 'fortuna-3-2017-2018',
  'ФОРТУНА-4 (2018-2019)': 'fortuna-4-2018-2019',
  'ФОРТУНА-5 (2020-2021)': 'fortuna-5-2020-2021',
  'ЧУ-ДО МАСТЕР': 'chu-do-master',
};

export const MONTH_BY_NAME: Record<string, number> = {
  ЯНВАРЬ: 1,
  ФЕВРАЛЬ: 2,
  МАРТ: 3,
  АПРЕЛЬ: 4,
  МАЙ: 5,
  ИЮНЬ: 6,
  ИЮЛЬ: 7,
  АВГУСТ: 8,
  СЕНТЯБРЬ: 9,
  ОКТЯБРЬ: 10,
  НОЯБРЬ: 11,
  ДЕКАБРЬ: 12,
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPage(url: string, delayMs = 300): Promise<string> {
  const urls = [url];
  if (url.includes('://fcfortuna.by/')) urls.push(url.replace('://fcfortuna.by/', '://www.fcfortuna.by/'));
  if (url.includes('://www.fcfortuna.by/')) urls.push(url.replace('://www.fcfortuna.by/', '://fcfortuna.by/'));

  let lastError: Error | undefined;
  for (const tryUrl of [...new Set(urls)]) {
    try {
      const response = await fetch(tryUrl, {
        headers: {
          'User-Agent': 'FCFortunaImporter/1.0',
          Accept: 'text/html',
        },
      });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} for ${tryUrl}`);
        continue;
      }
      const html = await response.text();
      if (delayMs > 0) await sleep(delayMs);
      return html;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

export function absUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function slugFromUrl(url: string): string {
  const path = url.replace(BASE, '').split('?')[0];
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/** Сайт добавляет суффикс _671 к slug в секции Чу-До Мастер */
export function normalizePlayerSlug(slug: string): string {
  return slug.replace(/_\d+$/, '');
}

export function isPlaceholderPhoto(photo: string | null | undefined): boolean {
  if (!photo) return true;
  return /no-img|placeholder/i.test(photo);
}

export function parseRuDateTime(value: string): string {
  const match = value.trim().match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  const [, d, m, y, hh = '00', mm = '00'] = match;
  return `${y}-${m}-${d} ${hh}:${mm}:00`;
}

export function htmlToPlain(html: string): string {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseTimeRange(cell: string): { start: string; end: string; note: string } | null {
  const text = htmlToPlain(cell).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const match = text.match(/(\d{1,2}\.\d{2})-(\d{1,2}\.\d{2})/);
  if (!match) return null;
  const note = text.replace(match[0], '').trim() || null;
  return { start: match[1], end: match[2], note: note ?? '' };
}
