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

export function parseNewsArticle(
  html: string,
  listExcerpt = '',
  coverImage: string | null = null
): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];
  const seenImages = new Set<string>();

  const intro = cleanExcerptText(listExcerpt);
  if (intro) {
    parts.push(`<p>${intro}</p>`);
  }

  const addImage = (src: string | undefined | null) => {
    const url = absUrl(src ?? '');
    if (!url || /kk\.png|ball\.gif|logo|no-img/i.test(url)) return;
    const key = url.replace('://www.', '://').toLowerCase();
    if (seenImages.has(key)) return;
    seenImages.add(key);
    parts.push(`<p><img src="${url}" alt=""></p>`);
  };

  addImage($('.mg-news-details .main-news-img img, .main-news-img img').first().attr('src'));
  $('#mg-gallery a.pic').each((_, el) => {
    addImage($(el).attr('href') || $(el).find('img').attr('src'));
  });
  $('#mg-gallery .mg-gallery-list img').each((_, el) => addImage($(el).attr('src')));
  $('.mg-news-full-desc img').each((_, el) => addImage($(el).attr('src')));
  addImage(coverImage);

  const fullDesc = $('.mg-news-full-desc').first().clone();
  fullDesc.find('script, style, link, iframe, #mg-gallery, .gal').remove();
  fullDesc.find('img').remove();
  const remainder = sanitizeArticleHtml(fullDesc.html() ?? '');
  if (remainder) parts.push(remainder);

  if (!parts.length && coverImage) {
    addImage(coverImage);
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

export interface GroupSection {
  players: PlayerCard[];
  photo: string | null;
}

export function parseGroupsPage(html: string): Map<string, GroupSection> {
  const $ = cheerio.load(html);
  const result = new Map<string, GroupSection>();

  $('.c-sub').each((_, subEl) => {
    const title = $(subEl).find('.c-sub__title').first().text().trim();
    const groupSlug = GROUP_BY_TITLE[title];
    if (!groupSlug) return;

    const section = $(subEl).closest('.l-col');
    const players: PlayerCard[] = [];
    const groupPhotoSrc = absUrl(section.find('.c-sub__img img').first().attr('src') ?? '');
    const photo =
      groupPhotoSrc && !/no-img|kk\.png|ball\.gif/i.test(groupPhotoSrc) ? groupPhotoSrc : null;

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

    result.set(groupSlug, { players, photo });
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

export function parseVizitkaPage(html: string): {
  title: string;
  intro: string;
  coaches: { photo: string; role: string; name: string; bio: string }[];
  footer: string;
  footerPhoto: string | null;
} {
  const $ = cheerio.load(html);
  const content = $('.static-page-content').first();
  const title = content.find('h1').first().text().replace(/\s+/g, ' ').trim() || 'Визитка';

  const introRoot = content.clone();
  introRoot.find('h1').remove();
  introRoot.find('.vizitka').nextAll().remove();
  introRoot.find('.vizitka').remove();
  const intro = htmlToPlain(introRoot.html() ?? '').trim();

  const coaches: { photo: string; role: string; name: string; bio: string }[] = [];
  const vizitka = content.find('.vizitka');
  vizitka.find('img').each((_, img) => {
    const src = $(img).attr('src') ?? '';
    if (!src || /stadium/i.test(src)) return;

    const photo = absUrl(src);
    const textBlock = extractVizitkaCoachText($, img);
    coaches.push({ photo, ...parseVizitkaCoachText($, textBlock) });
  });

  const footerRoot = $('<div></div>');
  content.find('.vizitka').nextAll().each((_, el) => {
    footerRoot.append($(el).clone());
  });
  const footerPhoto = absUrl(footerRoot.find('img').first().attr('src') ?? '') || null;
  footerRoot.find('img').remove();
  const footer = htmlToPlain(footerRoot.html() ?? '').trim();

  return { title, intro, coaches, footer, footerPhoto };
}

function extractVizitkaCoachText($: cheerio.CheerioAPI, img: any): cheerio.Cheerio<any> {
  const $img = $(img);
  const parent = $img.parent();

  if (parent.is('p')) {
    const wrapper = $('<div></div>');
    let afterImg = false;
    parent.contents().each((_, node) => {
      if (node === img) {
        afterImg = true;
        return;
      }
      if (afterImg) {
        wrapper.append($(node).clone());
      }
    });
    return wrapper;
  }

  return $img.siblings('p').first();
}

function normalizeCoachText(text: string): string {
  return text
    .replace(/\t+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function parseVizitkaCoachText(
  $: cheerio.CheerioAPI,
  block: cheerio.Cheerio<any>
): { role: string; name: string; bio: string } {
  const strong = block.find('strong').first();
  if (!strong.length) {
    const plain = normalizeCoachText(htmlToPlain(block.html() ?? ''));
    return { role: '', name: plain, bio: '' };
  }

  let name = normalizeCoachText(htmlToPlain(strong.html() ?? ''));
  const blockHtml = block.html() ?? '';
  const strongOuter = $.html(strong);
  const splitAt = blockHtml.indexOf(strongOuter);
  let role = splitAt >= 0 ? normalizeCoachText(htmlToPlain(blockHtml.slice(0, splitAt))) : '';
  let bio = splitAt >= 0 ? normalizeCoachText(htmlToPlain(blockHtml.slice(splitAt + strongOuter.length))) : '';

  const dateMatch = bio.match(/^\((\d{2}\.\d{2}\.\d{4})\)/);
  if (dateMatch) {
    name = `${name} (${dateMatch[1]})`;
    bio = bio.slice(dateMatch[0].length).trim();
  }

  return { role, name, bio };
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

    let title = $(a).text().replace(/\s+/g, ' ').trim();
    if (!title) {
      title =
        $(a).find('img').attr('alt') ||
        $(a).find('img').attr('title') ||
        $(a).closest('li, .item, article, .c-goods__item').find('.c-goods__title, h2, h3, .title').first().text().replace(/\s+/g, ' ').trim() ||
        slug;
    }

    items.push({
      year,
      title,
      slug,
      url,
    });
  });

  return items;
}

export function parseGalleryPhotos(html: string): string[] {
  const $ = cheerio.load(html);
  const photos: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string | undefined) => {
    const src = absUrl(raw ?? '');
    if (!src || /kk\.png|ball\.gif|logo|no-img/i.test(src)) return;
    const key = src.replace('://www.', '://').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    photos.push(src);
  };

  $('#mg-gallery a.pic, .mg-gallery-list a.pic').each((_, a) => {
    add($(a).attr('href') || $(a).find('img').attr('src'));
  });
  if (!photos.length) {
    $('#mg-gallery img, .mg-gallery-list img').each((_, img) => add($(img).attr('src')));
  }
  return photos;
}

export function parseHomeVideos(html: string): { url: string }[] {
  const $ = cheerio.load(html);
  const videos: { url: string }[] = [];
  $('.block-video-main iframe').each((_, iframe) => {
    const src = $(iframe).attr('src') ?? '';
    const match = src.match(/embed\/([^?&]+)/);
    if (!match) return;
    videos.push({
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
