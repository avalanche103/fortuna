import { htmlToPlain } from '../db/importer/utils';
import { upgradeInsecureUrls } from './html';

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
  return upgradeInsecureUrls(src);
}

/** Убирает первое (обложное) фото из тела, если оно уже показывается отдельно. */
export function stripNewsCoverFromBody(
  body: string | null | undefined,
  coverSrc: string | null | undefined
): string {
  if (!body) return '';
  if (!coverSrc) return body;

  const escaped = coverSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let result = body.replace(
    new RegExp(`<p>\\s*<img[^>]*src=["']${escaped}["'][^>]*>\\s*</p>`, 'i'),
    ''
  );
  if (result === body) {
    result = body.replace(new RegExp(`<img[^>]*src=["']${escaped}["'][^>]*>`, 'i'), '');
  }
  return result.replace(/<p>\s*<\/p>/gi, '').trim();
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Ставит заглавную картинку первым изображением в теле новости. */
export function applyNewsCover(
  body: string | null | undefined,
  coverSrc: string | null | undefined,
  alt = ''
): string {
  const currentCover = getNewsCoverImage(body);
  const nextBody = stripNewsCoverFromBody(body, currentCover);
  const cover = (coverSrc || '').trim();
  if (!cover) return nextBody;
  return `<p><img src="${escapeHtmlAttr(cover)}" alt="${escapeHtmlAttr(alt)}"></p>\n${nextBody}`.trim();
}
