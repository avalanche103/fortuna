import * as cheerio from 'cheerio';
import {
  BASE,
  GROUP_BY_TITLE,
  MONTH_BY_NAME,
  absUrl,
  htmlToPlain,
  parseRuDateTime,
  parseTimeRange,
  slugFromUrl,
} from './utils';
import { buildNewsExcerpt, cleanExcerptText } from '../../utils/news-text';

export interface NewsPreview {
  url: string;
  slug: string;
  category: string;
  title: string;
  publishedAt: string;
  excerpt: string;
  coverImage: string | null;
}

export interface PlayerCard {
  name: string;
  slug: string;
  birthDate: string | null;
  position: string | null;
  club: string | null;
  bio: string | null;
  photo: string | null;
  number: number | null;
}

export interface YearLink {
  year: number;
  title: string;
  slug: string;
  url: string;
}

export function parseNewsListPage(html: string): { items: NewsPreview[]; totalPages: number } {
  const $ = cheerio.load(html);
  const items: NewsPreview[] = [];

  $('article.mg-main-news-item').each((_, el) => {
    const block = $(el);
    const link = block.find('h3.mg-news-title a').attr('href') ?? block.find('a.mg-list-news-img').attr('href');
    if (!link) return;

    const url = absUrl(link);
    const parts = url.replace(BASE, '').split('/').filter(Boolean);
    const slug = parts[parts.length - 1] ?? '';
    const category = parts.length >= 3 && parts[0] === 'blog' ? parts[1] : 'novosti';
    const title = block.find('h3.mg-news-title a').text().trim();
    const dateText = block.find('.mg-news-date').text().trim();
    const excerpt = cleanExcerptText(htmlToPlain(block.find('.mg-news-main-desc').html() ?? ''));
    const coverImage = absUrl(
      block.find('a.mg-list-news-img img, .mg-list-news-img img').attr('src') ?? ''
    ) || null;

    items.push({
      url,
      slug,
      category,
      title,
      publishedAt: parseRuDateTime(dateText),
      excerpt,
      coverImage: coverImage && !/kk\.png|ball\.gif|no-img/i.test(coverImage) ? coverImage : null,
    });
  });

  let totalPages = 1;
  const allPagesText = $('.mg-pager .allPages span').first().text().trim();
  if (allPagesText) {
    totalPages = parseInt(allPagesText, 10) || 1;
  } else {
    $('.mg-pager a.linkPage[href*="page="]').each((_, a) => {
      const href = $(a).attr('href') ?? '';
      const match = href.match(/page=(\d+)/);
      if (match) totalPages = Math.max(totalPages, parseInt(match[1], 10));
    });
  }

  return { items, totalPages };
}

export function parseNewsArticle(html: string): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];

  const mainImg = $('.mg-news-details .main-news-img img, .main-news-img img').first().attr('src');
  if (mainImg && !/kk\.png|ball\.gif|logo/i.test(mainImg)) {
    parts.push(`<p><img src="${absUrl(mainImg)}" alt=""></p>`);
  }

  const bodyHtml = $('.mg-news-full-desc').html() ?? '';
  const sanitized = sanitizeArticleHtml(bodyHtml);
  if (sanitized) parts.push(sanitized);

  if (!parts.length) {
    const plain = htmlToPlain(bodyHtml);
    if (plain) parts.push(`<p>${plain.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`);
  }

  return parts.join('\n').trim();
}

function sanitizeArticleHtml(html: string): string {
  const plain = htmlToPlain(html);
  if (!plain) return '';

  const $ = cheerio.load(`<div id="root">${html}</div>`);
  $('#root script, #root style, #root iframe').remove();
  $('#root img').each((_, el) => {
    const src = $(el).attr('src');
    if (!src || /kk\.png|ball\.gif|logo/i.test(src)) {
      $(el).remove();
      return;
    }
    $(el).attr('src', absUrl(src));
  });
  $('#root a').each((_, el) => {
    const href = $(el).attr('href');
    if (href) $(el).attr('href', absUrl(href));
  });

  const result = $('#root').html()?.trim() ?? '';
  return htmlToPlain(result) ? result : '';
}

export function parseGroupsPage(html: string): Map<string, PlayerCard[]> {
  const $ = cheerio.load(html);
  const result = new Map<string, PlayerCard[]>();

  $('.c-sub').each((_, subEl) => {
    const title = $(subEl).find('.c-sub__title').first().text().trim();
    const groupSlug = GROUP_BY_TITLE[title];
    if (!groupSlug) return;

    const section = $(subEl).closest('.l-col');
    const players: PlayerCard[] = [];

    section.find('.c-goods__item').each((__, itemEl) => {
      const item = $(itemEl);
      const name =
        item.find('.c-goods__title span').first().text().trim() ||
        item.find('.hidden').first().text().trim();
      if (!name || name.includes('fcfortuna')) return;

      const href = item.find('.c-goods__title').attr('href') ?? item.find('.c-goods__img').attr('href');
      const numberText = item.closest('.numer-list').find('.numer').first().text().trim();
      const number = numberText ? parseInt(numberText, 10) : null;

      let birthDate: string | null = null;
      let position: string | null = null;
      let club: string | null = null;
      item.find('.c-goods__prop div').each((___, prop) => {
        const label = $(prop).find('.prop-name').text().trim();
        const value = $(prop).text().replace(label, '').trim().replace(/\.$/, '');
        if (label.includes('Дата рождения')) birthDate = value;
        else if (label.includes('Амплуа')) {
          if (/^\d{2}\.\d{2}\.\d{4}$/.test(value) && !birthDate) birthDate = value;
          else position = value;
        } else if (label.includes('Клуб')) club = value;
      });

      const photo = absUrl(item.find('img.mg-product-image').attr('src') ?? '');

      players.push({
        name,
        slug: href ? slugFromUrl(href) : slugFromName(name),
        birthDate,
        position,
        club,
        bio: htmlToPlain(item.find('.c-goods__description').html() ?? '') || null,
        photo: photo || null,
        number: Number.isFinite(number) ? number : null,
      });
    });

    result.set(groupSlug, players);
  });

  return result;
}

export function parseGraduatesPage(html: string): PlayerCard[] {
  const $ = cheerio.load(html);
  const players: PlayerCard[] = [];

  $('.c-goods__item').each((_, el) => {
    const item = $(el);
    const name = item.find('.c-goods__title span').first().text().trim();
    if (!name) return;

    const href = item.find('.c-goods__title').attr('href') ?? '';
    let birthDate: string | null = null;
    let position: string | null = null;
    let club: string | null = null;

    item.find('.c-goods__prop div').each((__, prop) => {
      const label = $(prop).find('.prop-name').text().trim();
      const value = $(prop).text().replace(label, '').trim().replace(/\.$/, '');
      if (label.includes('Дата рождения')) birthDate = value;
      if (label.includes('Амплуа')) position = value;
      if (label.includes('Клуб')) club = value;
    });

    const photo = absUrl(item.find('img.mg-product-image').attr('src') ?? '');
    const bio = htmlToPlain(item.find('.c-goods__description').html() ?? '') || null;

    players.push({
      name,
      slug: slugFromUrl(href) || slugFromName(name),
      birthDate,
      position,
      club,
      bio,
      photo: photo || null,
      number: null,
    });
  });

  return players;
}

export function parseSchedulePage(html: string): {
  year: number;
  month: number;
  groupNames: string[];
  rows: { day: number; weekday: string; slots: (string | null)[] }[];
} {
  const $ = cheerio.load(html);
  const monthText = $('p strong').first().text().trim().toUpperCase();
  const month = MONTH_BY_NAME[monthText] ?? new Date().getMonth() + 1;
  const year = new Date().getFullYear();

  const table = $('table.shedule');
  const groupNames: string[] = [];
  table.find('tr').first().find('th').each((i, th) => {
    if (i === 0) return;
    groupNames.push($(th).text().replace(/\s+/g, ' ').trim());
  });

  const rows: { day: number; weekday: string; slots: (string | null)[] }[] = [];
  table.find('tr').slice(1).each((_, tr) => {
    const cells = $(tr).find('td');
    if (!cells.length) return;

    const dayCell = htmlToPlain($(cells[0]).html() ?? '');
    const dayMatch = dayCell.match(/^(\d{1,2})/);
    if (!dayMatch) return;
    const weekdayMatch = dayCell.match(/\(([^)]+)\)/);
    const slots: (string | null)[] = [];
    cells.slice(1).each((__, td) => {
      const html = $(td).html() ?? '';
      slots.push(html.trim() ? html : null);
    });

    rows.push({
      day: parseInt(dayMatch[1], 10),
      weekday: weekdayMatch?.[1] ?? '',
      slots,
    });
  });

  return { year, month, groupNames, rows };
}

export function parseVizitkaPage(html: string): { title: string; body: string } {
  const $ = cheerio.load(html);
  const content = $('.static-page-content').first();
  const title = content.find('h1').first().text().replace(/\s+/g, ' ').trim();
  const clone = content.clone();
  clone.find('h1').remove();
  const body = htmlToPlain(clone.html() ?? '');
  return { title: title || 'Визитка', body };
}

export function parseYearLinks(html: string, prefix: string): number[] {
  const $ = cheerio.load(html);
  const years = new Set<number>();
  $(`a[href*="${prefix}/"]`).each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const match = href.match(new RegExp(`${prefix}/(\\d{4})`));
    if (match) years.add(parseInt(match[1], 10));
  });
  return [...years].sort((a, b) => b - a);
}

export function parseArchiveYearItems(html: string, year: number): YearLink[] {
  const $ = cheerio.load(html);
  const items: YearLink[] = [];
  const seen = new Set<string>();

  $(`a[href*="/arhiv/${year}/"]`).each((_, a) => {
    const url = absUrl($(a).attr('href') ?? '');
    const slug = slugFromUrl(url);
    if (!slug || slug === String(year) || seen.has(slug)) return;
    seen.add(slug);
    items.push({
      year,
      title: $(a).text().trim(),
      slug,
      url,
    });
  });

  return items;
}

export function parseGalleryYearItems(html: string, year: number): YearLink[] {
  const $ = cheerio.load(html);
  const items: YearLink[] = [];
  const seen = new Set<string>();

  $(`a[href*="/fotogalereya/${year}/"]`).each((_, a) => {
    const url = absUrl($(a).attr('href') ?? '');
    const slug = slugFromUrl(url);
    if (!slug || slug === String(year) || seen.has(slug)) return;
    seen.add(slug);
    items.push({
      year,
      title: $(a).text().trim(),
      slug,
      url,
    });
  });

  return items;
}

export function parseGalleryPhotos(html: string): string[] {
  const $ = cheerio.load(html);
  const photos: string[] = [];
  $('#mg-gallery img, .mg-gallery-list img').each((_, img) => {
    const src = absUrl($(img).attr('src') ?? '');
    if (src) photos.push(src);
  });
  return photos;
}

export function parseHomeVideos(html: string): { title: string; url: string }[] {
  const $ = cheerio.load(html);
  const videos: { title: string; url: string }[] = [];
  $('.block-video-main iframe').each((i, iframe) => {
    const src = $(iframe).attr('src') ?? '';
    const match = src.match(/embed\/([^?&]+)/);
    if (!match) return;
    videos.push({
      title: `FC Fortuna TV #${i + 1}`,
      url: `https://www.youtube.com/watch?v=${match[1]}`,
    });
  });
  return videos;
}

export function parseHomeSettings(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const recruitmentBlock = $('.centered .description').first();
  const title = recruitmentBlock.prevAll('.table-title').first().text().replace(/\s+/g, ' ').trim();
  const subtitle = recruitmentBlock.find('p strong span').first().text().trim();
  const body = htmlToPlain(recruitmentBlock.html() ?? '');

  return {
    recruitment_title: title || 'Сделайте правильный выбор!',
    recruitment_subtitle: subtitle,
    recruitment_body: body,
  };
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'e')
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-|-$/g, '');
}

export { parseTimeRange, GROUP_BY_TITLE };
