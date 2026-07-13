import db from '../db';
import { CHUDO_MASTER_SLUG } from '../constants';
import { queryRow, queryRows } from '../db/helpers';
import { buildNewsExcerpt, getNewsCoverImage as extractNewsCoverImage } from '../utils/news-text';
import type {
  ArchiveItem,
  ArchiveYear,
  Group,
  News,
  Player,
  ScheduleEntry,
  ScheduleMonth,
  SiteSettings,
  Video,
  VizitkaSection,
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

export function getLatestNews(limit = 8): News[] {
  return queryRows<News>(db.prepare('SELECT * FROM news ORDER BY published_at DESC LIMIT ?').all(limit));
}

export function getNewsList(page = 1, perPage = 10): { items: News[]; total: number; pages: number } {
  const total = queryRow<{ c: number }>(db.prepare('SELECT COUNT(*) as c FROM news').get())?.c ?? 0;
  const items = queryRows<News>(
    db.prepare('SELECT * FROM news ORDER BY published_at DESC LIMIT ? OFFSET ?').all(perPage, (page - 1) * perPage)
  );
  return { items, total, pages: Math.ceil(total / perPage) };
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

export function getVideos(limit = 6): Video[] {
  return queryRows<Video>(
    db.prepare('SELECT * FROM videos ORDER BY sort_order, published_at DESC LIMIT ?').all(limit)
  );
}

export function getVizitkaSections(): VizitkaSection[] {
  return queryRows<VizitkaSection>(db.prepare('SELECT * FROM vizitka_sections ORDER BY sort_order').all());
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

export function formatDateRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function youtubeEmbedUrl(url: string): string {
  const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

export function youtubeThumb(url: string): string {
  const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : '';
}
