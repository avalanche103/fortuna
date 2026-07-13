import { htmlToPlain } from '../db/importer/utils';

const JUNK_RE = /resizeWidthMgGallery|function\s*\(|^\s*</i;

export function cleanExcerptText(text: string): string {
  if (!text) return '';
  let result = text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\bresizeWidthMgGallery\s*\(\s*\)\s*;?/gi, '')
    .trim();

  if (/<[a-z][\s\S]*>/i.test(result)) {
    result = htmlToPlain(result);
  }

  return result.replace(/\s+/g, ' ').trim();
}

export function isJunkExcerpt(text: string): boolean {
  const cleaned = cleanExcerptText(text);
  if (!cleaned || cleaned.length < 3) return true;
  return JUNK_RE.test(text) || JUNK_RE.test(cleaned);
}

export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).replace(/\s+\S*$/, '')}…`;
}

export function buildNewsExcerpt(
  excerpt: string | null | undefined,
  body: string | null | undefined,
  maxLen = 200
): string {
  const fromExcerpt = cleanExcerptText(excerpt ?? '');
  if (fromExcerpt && !isJunkExcerpt(fromExcerpt)) {
    return truncateText(fromExcerpt, maxLen);
  }

  const fromBody = cleanExcerptText(htmlToPlain(body ?? ''));
  if (!fromBody || isJunkExcerpt(fromBody)) return '';
  return truncateText(fromBody, maxLen);
}

export function getNewsCoverImage(body: string | null | undefined): string | null {
  if (!body) return null;
  const match = body.match(/<img[^>]+src=["']([^"']+)["']/i);
  const src = match?.[1]?.trim();
  if (!src || /kk\.png|ball\.gif|no-img|logo/i.test(src)) return null;
  return src;
}
