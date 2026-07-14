import db from '../db';
import { CHUDO_MASTER_SLUG } from '../constants';
import { queryRow, queryRows } from '../db/helpers';
import { buildNewsExcerpt, getNewsCoverImage as extractNewsCoverImage, stripNewsCoverFromBody } from '../utils/news-text';
import { youtubeEmbedUrl, youtubeThumb } from '../utils/youtube';
import type {
  ArchiveItem,
  ArchivePhoto,
  ArchiveYear,
  Group,
  News,
  Player,
  ScheduleEntry,
  ScheduleMonth,
  SiteSettings,
  Video,
  VizitkaSection,
  VizitkaCoach,
} from '../types';

export function getSettings(): SiteSettings {
  const settingsRows = queryRows<{ key: string; value: string }>(
    db.prepare('SELECT key, value FROM site_settings').all()
  );
  return Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
}

export function getSetting(key: string, fallback = ''): string {
  const setting = queryRow<{ value: string }>(db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key));
  return setting?.value ?? fallback;
}

export function getRecruitmentContent(settings: SiteSettings = getSettings()): {
  title: string;
  subtitle: string;
  teaser: string;
  advantages: string;
  phones: string;
  hours: string;
} {
  const title = settings.recruitment_title || 'Сделайте правильный выбор!';
  const subtitle = settings.recruitment_subtitle || '';
  let body = settings.recruitment_body || '';

  if (subtitle) {
    const escaped = subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body = body.replace(new RegExp('^\\s*' + escaped + '\\s*', 'i'), '').trim();
  }

  const marker = /ПОЧЕМУ ИМЕННО К НАМ\s*\?/i;
  const match = body.match(marker);
  let teaser = body;
  let advantages = '';

  if (match && match.index != null) {
    teaser = body.slice(0, match.index).trim();
    advantages = body.slice(match.index + match[0].length).trim();
  }

  return {
    title,
    subtitle,
    teaser,
    advantages,
    phones: settings.banner_phones || '+375-29-661-19-31',
    hours: settings.banner_hours || '',
  };
}

export function getLatestNews(limit = 8): News[] {
  return queryRows<News>(db.prepare('SELECT * FROM news ORDER BY published_at DESC LIMIT ?').all(limit));
}

export function getNewsYears(): number[] {
  return queryRows<{ year: number }>(
    db
      .prepare(
        `SELECT DISTINCT CAST(substr(published_at, 1, 4) AS INTEGER) AS year
         FROM news
         WHERE published_at IS NOT NULL AND length(published_at) >= 4
         ORDER BY year DESC`
      )
      .all()
  ).map((row) => row.year);
}

export function getNewsList(
  page = 1,
  perPage = 18,
  year?: number | null
): { items: News[]; total: number; pages: number } {
  const yearFilter = year && year > 1900 ? year : null;
  const total = yearFilter
    ? (queryRow<{ c: number }>(
        db
          .prepare(`SELECT COUNT(*) as c FROM news WHERE substr(published_at, 1, 4) = ?`)
          .get(String(yearFilter))
      )?.c ?? 0)
    : (queryRow<{ c: number }>(db.prepare('SELECT COUNT(*) as c FROM news').get())?.c ?? 0);

  const offset = (page - 1) * perPage;
  // По году — от первых записей года (январь и далее); без фильтра — сначала свежие
  const items = yearFilter
    ? queryRows<News>(
        db
          .prepare(
            `SELECT * FROM news
             WHERE substr(published_at, 1, 4) = ?
             ORDER BY published_at ASC
             LIMIT ? OFFSET ?`
          )
          .all(String(yearFilter), perPage, offset)
      )
    : queryRows<News>(
        db.prepare('SELECT * FROM news ORDER BY published_at DESC LIMIT ? OFFSET ?').all(perPage, offset)
      );

  return { items, total, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export function getNewsBySlug(slug: string): News | undefined {
  return queryRow<News>(db.prepare('SELECT * FROM news WHERE slug = ?').get(slug));
}

export function getBirthdaysThisMonth(): Player[] {
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  return queryRows<Player>(
    db.prepare(
      `SELECT * FROM players
       WHERE is_graduate = 0 AND birth_date IS NOT NULL
       AND substr(birth_date, 4, 2) = ?
       ORDER BY substr(birth_date, 1, 2)`
    ).all(month)
  );
}

export function getFeaturedGraduates(limit = 12): Player[] {
  return queryRows<Player>(
    db.prepare('SELECT * FROM players WHERE is_graduate = 1 ORDER BY sort_order, name LIMIT ?').all(limit)
  );
}

export function getAllGraduates(): Player[] {
  return queryRows<Player>(
    db.prepare('SELECT * FROM players WHERE is_graduate = 1 ORDER BY sort_order, name').all()
  );
}

export function getGraduateBySlug(slug: string): Player | undefined {
  return queryRow<Player>(db.prepare('SELECT * FROM players WHERE slug = ? AND is_graduate = 1').get(slug));
}

export function getGroups(): Group[] {
  return queryRows<Group>(db.prepare('SELECT * FROM groups ORDER BY sort_order').all());
}

/** Основные группы (для привязки игроков в админке) */
export function getRosterGroups(): Group[] {
  return queryRows<Group>(
    db.prepare('SELECT * FROM groups WHERE is_schedule_only = 0 ORDER BY sort_order').all()
  );
}

/** Все группы на странице «Группы», включая Чу-До Мастер */
export function getGruppyGroups(): Group[] {
  return getGroups();
}

export function getChudoMasterPlayers(): Player[] {
  return queryRows<Player>(
    db.prepare(
      `SELECT * FROM players
       WHERE is_chudo_master = 1 AND is_graduate = 0
       ORDER BY name`
    ).all()
  );
}

export function getGruppyGroupPlayers(group: Group): Player[] {
  if (group.slug === CHUDO_MASTER_SLUG) {
    return getChudoMasterPlayers();
  }
  return getGroupPlayers(group.id);
}

export function getGruppyPlayersByGroup(): Map<number, Player[]> {
  const groups = getGruppyGroups();
  const map = new Map<number, Player[]>();
  for (const g of groups) {
    map.set(g.id, getGruppyGroupPlayers(g));
  }
  return map;
}

export function getScheduleGroups(): Group[] {
  return getGroups();
}

export function getGroupBySlug(slug: string): Group | undefined {
  return queryRow<Group>(db.prepare('SELECT * FROM groups WHERE slug = ?').get(slug));
}

export function getGroupPlayers(groupId: number): Player[] {
  return queryRows<Player>(
    db.prepare(
      `SELECT p.*, gp.number
       FROM players p
       JOIN group_players gp ON gp.player_id = p.id
       WHERE gp.group_id = ?
       ORDER BY gp.number, p.name`
    ).all(groupId)
  );
}

export function getAllGroupPlayers(): Map<number, Player[]> {
  return getGruppyPlayersByGroup();
}

export function getCurrentScheduleMonth(): ScheduleMonth | undefined {
  const now = new Date();
  return queryRow<ScheduleMonth>(
    db.prepare('SELECT * FROM schedule_months WHERE year = ? AND month = ?').get(now.getFullYear(), now.getMonth() + 1)
  );
}

export function getScheduleMonth(year: number, month: number): ScheduleMonth | undefined {
  return queryRow<ScheduleMonth>(
    db.prepare('SELECT * FROM schedule_months WHERE year = ? AND month = ?').get(year, month)
  );
}

export function getScheduleEntries(monthId: number): ScheduleEntry[] {
  return queryRows<ScheduleEntry>(
    db.prepare(
      `SELECT se.*, g.name as group_name
       FROM schedule_entries se
       JOIN groups g ON g.id = se.group_id
       WHERE se.month_id = ?
       ORDER BY se.day, g.sort_order`
    ).all(monthId)
  );
}

export function getVideos(limit?: number): Video[] {
  if (limit === undefined) {
    return queryRows<Video>(
      db.prepare('SELECT * FROM videos ORDER BY sort_order, published_at DESC').all()
    );
  }
  return queryRows<Video>(
    db.prepare('SELECT * FROM videos ORDER BY sort_order, published_at DESC LIMIT ?').all(limit)
  );
}

export function getVizitkaSections(): VizitkaSection[] {
  return queryRows<VizitkaSection>(db.prepare('SELECT * FROM vizitka_sections ORDER BY sort_order').all());
}

export function getVizitkaCoaches(): VizitkaCoach[] {
  return queryRows<VizitkaCoach>(db.prepare('SELECT * FROM vizitka_coaches ORDER BY sort_order').all());
}

export function getArchiveYears(type: 'archive' | 'gallery'): ArchiveYear[] {
  return queryRows<ArchiveYear>(
    db.prepare('SELECT * FROM archive_years WHERE type = ? ORDER BY year DESC').all(type)
  );
}

export function getArchiveYear(year: number, type: 'archive' | 'gallery'): ArchiveYear | undefined {
  return queryRow<ArchiveYear>(
    db.prepare('SELECT * FROM archive_years WHERE year = ? AND type = ?').get(year, type)
  );
}

export function getArchiveItems(yearId: number): ArchiveItem[] {
  return queryRows<ArchiveItem>(
    db.prepare('SELECT * FROM archive_items WHERE year_id = ? ORDER BY sort_order, title').all(yearId)
  );
}

export function getArchiveItem(yearId: number, slug: string): ArchiveItem | undefined {
  return queryRow<ArchiveItem>(
    db.prepare('SELECT * FROM archive_items WHERE year_id = ? AND slug = ?').get(yearId, slug)
  );
}

export function getArchivePhotos(itemId: number): ArchivePhoto[] {
  return queryRows<ArchivePhoto>(
    db.prepare('SELECT * FROM archive_photos WHERE item_id = ? ORDER BY sort_order, id').all(itemId)
  );
}

export interface GalleryPhotoNav {
  id: number;
  filename: string;
  caption: string | null;
  year: number;
  albumSlug: string;
  albumTitle: string;
  position: number;
  total: number;
}

function mapGalleryPhotoNav(row: {
  id: number;
  filename: string;
  caption: string | null;
  year: number;
  album_slug: string;
  album_title: string;
  position?: number;
  total?: number;
}): GalleryPhotoNav {
  return {
    id: row.id,
    filename: row.filename,
    caption: row.caption,
    year: row.year,
    albumSlug: row.album_slug,
    albumTitle: row.album_title,
    position: row.position ?? 0,
    total: row.total ?? 0,
  };
}

export function getGalleryPhotoNav(photoId: number): {
  current: GalleryPhotoNav;
  prev: GalleryPhotoNav | null;
  next: GalleryPhotoNav | null;
} | null {
  const row = queryRow<{
    id: number;
    filename: string;
    caption: string | null;
    year: number;
    album_slug: string;
    album_title: string;
    position: number;
    total: number;
    prev_id: number | null;
    next_id: number | null;
  }>(
    db
      .prepare(
        `WITH ordered AS (
           SELECT
             ap.id,
             ap.filename,
             ap.caption,
             ay.year,
             ai.slug AS album_slug,
             ai.title AS album_title,
             ROW_NUMBER() OVER (
               ORDER BY ay.year DESC, ai.sort_order ASC, ap.sort_order ASC, ap.id ASC
             ) AS position,
             COUNT(*) OVER () AS total,
             LAG(ap.id) OVER (
               ORDER BY ay.year DESC, ai.sort_order ASC, ap.sort_order ASC, ap.id ASC
             ) AS prev_id,
             LEAD(ap.id) OVER (
               ORDER BY ay.year DESC, ai.sort_order ASC, ap.sort_order ASC, ap.id ASC
             ) AS next_id
           FROM archive_photos ap
           JOIN archive_items ai ON ai.id = ap.item_id
           JOIN archive_years ay ON ay.id = ai.year_id
           WHERE ay.type = 'gallery'
         )
         SELECT * FROM ordered WHERE id = ?`
      )
      .get(photoId)
  );

  if (!row) return null;

  const loadById = (id: number | null, position: number) => {
    if (id == null) return null;
    const neighbor = queryRow<{
      id: number;
      filename: string;
      caption: string | null;
      year: number;
      album_slug: string;
      album_title: string;
    }>(
      db
        .prepare(
          `SELECT
             ap.id,
             ap.filename,
             ap.caption,
             ay.year,
             ai.slug AS album_slug,
             ai.title AS album_title
           FROM archive_photos ap
           JOIN archive_items ai ON ai.id = ap.item_id
           JOIN archive_years ay ON ay.id = ai.year_id
           WHERE ap.id = ?`
        )
        .get(id)
    );
    return neighbor
      ? mapGalleryPhotoNav({ ...neighbor, position, total: row.total })
      : null;
  };

  return {
    current: mapGalleryPhotoNav(row),
    prev: loadById(row.prev_id, row.position - 1),
    next: loadById(row.next_id, row.position + 1),
  };
}

export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export function getNewsExcerpt(article: Pick<News, 'excerpt' | 'body'>, maxLen = 200): string {
  return buildNewsExcerpt(article.excerpt, article.body, maxLen);
}

export function getNewsCoverImage(article: Pick<News, 'body'>): string | null {
  return extractNewsCoverImage(article.body);
}

export function getNewsArticleBody(article: Pick<News, 'body'>): string {
  const cover = extractNewsCoverImage(article.body);
  return stripNewsCoverFromBody(article.body, cover);
}

export function splitPlayerName(name: string): { surname: string; firstName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { surname: '', firstName: '' };
  if (parts.length === 1) return { surname: parts[0], firstName: '\u00a0' };
  return { surname: parts[0], firstName: parts.slice(1).join(' ') };
}

export function formatDateRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export { youtubeEmbedUrl, youtubeThumb };
