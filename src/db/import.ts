import db, { runMigrations } from './index';
import { queryRow } from './helpers';
import { CHUDO_MASTER_SLUG } from '../constants';
import { buildNewsExcerpt } from '../utils/news-text';
import { resolveYoutubeTitle } from '../utils/youtube';
import { fetchPage, normalizePlayerSlug, isPlaceholderPhoto, sleep } from './importer/utils';
import {
  parseArchiveYearItems,
  parseGalleryPhotos,
  parseGalleryYearItems,
  parseGraduatesPage,
  parseGroupsPage,
  parseHomeSettings,
  parseHomeVideos,
  parseNewsArticle,
  parseNewsListPage,
  parseSchedulePage,
  parseTimeRange,
  parseVizitkaPage,
  parseYearLinks,
  GROUP_BY_TITLE,
  type PlayerCard,
} from './importer/parsers';

const BASE = 'https://fcfortuna.by';

interface ImportOptions {
  sections: Set<string>;
  newsPages: number | null;
  fetchBodies: boolean;
  galleryPhotos: boolean;
}

function parseArgs(): ImportOptions {
  const args = process.argv.slice(2);
  const sections = new Set<string>();
  let newsPages: number | null = null;
  let fetchBodies = true;
  let galleryPhotos = false;

  for (const arg of args) {
    if (arg === '--all') {
      ['news', 'players', 'graduates', 'schedule', 'vizitka', 'videos', 'settings', 'archive', 'gallery'].forEach((s) =>
        sections.add(s)
      );
    } else if (arg === '--fetch-bodies') fetchBodies = true;
    else if (arg === '--no-fetch-bodies') fetchBodies = false;
    else if (arg === '--gallery-photos') galleryPhotos = true;
    else if (arg.startsWith('--news-pages=')) newsPages = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--only=')) {
      arg
        .slice('--only='.length)
        .split(',')
        .forEach((s) => sections.add(s.trim()));
    }
  }

  if (sections.size === 0) {
    ['news', 'players', 'graduates', 'schedule', 'vizitka', 'videos', 'settings', 'archive', 'gallery'].forEach((s) =>
      sections.add(s)
    );
  }

  return { sections, newsPages, fetchBodies, galleryPhotos };
}

function clearAllContent(): void {
  db.exec(`
    DELETE FROM archive_photos;
    DELETE FROM archive_items;
    DELETE FROM archive_years;
    DELETE FROM schedule_entries;
    DELETE FROM schedule_months;
    DELETE FROM group_players;
    DELETE FROM players;
    DELETE FROM news;
    DELETE FROM videos;
    DELETE FROM vizitka_coaches;
    DELETE FROM vizitka_sections;
  `);
}

function clearSections(sections: Set<string>): void {
  if (sections.has('news')) db.exec('DELETE FROM news');
  if (sections.has('players') && sections.has('graduates')) {
    db.exec('DELETE FROM group_players');
    db.exec('DELETE FROM players');
  } else if (sections.has('players')) {
    db.exec('DELETE FROM group_players');
    db.exec('DELETE FROM players WHERE is_graduate = 0');
  } else if (sections.has('graduates')) {
    db.exec('DELETE FROM players WHERE is_graduate = 1');
  }
  if (sections.has('schedule')) {
    db.exec('DELETE FROM schedule_entries');
    db.exec('DELETE FROM schedule_months');
  }
  if (sections.has('videos')) db.exec('DELETE FROM videos');
  if (sections.has('vizitka')) {
    db.exec('DELETE FROM vizitka_coaches');
    db.exec('DELETE FROM vizitka_sections');
  }
  if (sections.has('archive') || sections.has('gallery')) {
    if (sections.has('archive') && sections.has('gallery')) {
      db.exec('DELETE FROM archive_photos');
      db.exec('DELETE FROM archive_items');
      db.exec('DELETE FROM archive_years');
    } else if (sections.has('archive')) {
      db.exec(`DELETE FROM archive_photos WHERE item_id IN (
        SELECT ai.id FROM archive_items ai JOIN archive_years ay ON ay.id = ai.year_id WHERE ay.type = 'archive'
      )`);
      db.exec(`DELETE FROM archive_items WHERE year_id IN (SELECT id FROM archive_years WHERE type = 'archive')`);
      db.exec(`DELETE FROM archive_years WHERE type = 'archive'`);
    } else {
      db.exec(`DELETE FROM archive_photos WHERE item_id IN (
        SELECT ai.id FROM archive_items ai JOIN archive_years ay ON ay.id = ai.year_id WHERE ay.type = 'gallery'
      )`);
      db.exec(`DELETE FROM archive_items WHERE year_id IN (SELECT id FROM archive_years WHERE type = 'gallery')`);
      db.exec(`DELETE FROM archive_years WHERE type = 'gallery'`);
    }
  }
}

function getGroupIdBySlug(slug: string): number | undefined {
  return queryRow<{ id: number }>(db.prepare('SELECT id FROM groups WHERE slug = ?').get(slug))?.id;
}

function findExistingPlayer(player: PlayerCard): { id: number; photo: string | null } | undefined {
  const baseSlug = normalizePlayerSlug(player.slug);
  return queryRow<{ id: number; photo: string | null }>(
    db.prepare(
      `SELECT id, photo FROM players
       WHERE is_graduate = 0 AND (slug = ? OR slug = ? OR name = ?)
       ORDER BY
         CASE WHEN name = ? THEN 0 WHEN slug = ? THEN 1 WHEN slug = ? THEN 2 ELSE 3 END,
         EXISTS (SELECT 1 FROM group_players WHERE player_id = players.id) DESC
       LIMIT 1`
    ).get(player.slug, baseSlug, player.name, player.name, player.slug, baseSlug)
  );
}

function markChudoMasterPlayer(player: PlayerCard): void {
  const existing = findExistingPlayer(player);
  if (existing) {
    db.prepare('UPDATE players SET is_chudo_master = 1 WHERE id = ?').run(existing.id);
    return;
  }
  upsertPlayer(player, { isGraduate: false, isChudoMaster: true });
}

function upsertPlayer(
  player: PlayerCard,
  opts: { isGraduate?: boolean; isFeatured?: boolean; isChudoMaster?: boolean; sortOrder?: number }
): number {
  const existing = queryRow<{ id: number; photo: string | null }>(
    db.prepare('SELECT id, photo FROM players WHERE slug = ?').get(player.slug)
  );

  if (existing) {
    const photo =
      isPlaceholderPhoto(player.photo) && existing.photo && !isPlaceholderPhoto(existing.photo)
        ? existing.photo
        : player.photo;

    db.prepare(
      `UPDATE players SET name=?, birth_date=?, position=?, club=?, bio=?, photo=?,
       is_graduate = CASE WHEN ? = 1 OR is_graduate = 1 THEN 1 ELSE 0 END,
       is_featured = CASE WHEN ? = 1 OR is_featured = 1 THEN 1 ELSE 0 END,
       is_chudo_master = CASE WHEN ? = 1 OR is_chudo_master = 1 THEN 1 ELSE 0 END,
       sort_order=?
       WHERE id=?`
    ).run(
      player.name,
      player.birthDate,
      player.position,
      player.club,
      player.bio,
      photo,
      opts.isGraduate ? 1 : 0,
      opts.isFeatured ? 1 : 0,
      opts.isChudoMaster ? 1 : 0,
      opts.sortOrder ?? 0,
      existing.id
    );
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO players (name, slug, birth_date, position, club, bio, photo, is_graduate, is_featured, is_chudo_master, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      player.name,
      player.slug,
      player.birthDate,
      player.position,
      player.club,
      player.bio,
      player.photo,
      opts.isGraduate ? 1 : 0,
      opts.isFeatured ? 1 : 0,
      opts.isChudoMaster ? 1 : 0,
      opts.sortOrder ?? 0
    );
  return Number(result.lastInsertRowid);
}

async function importNews(opts: ImportOptions): Promise<void> {
  console.log('→ Новости...');
  const firstHtml = await fetchPage(`${BASE}/blog`);
  const { totalPages } = parseNewsListPage(firstHtml);
  const maxPage = opts.newsPages ?? totalPages;
  let imported = 0;

  const insert = db.prepare(
    `INSERT OR REPLACE INTO news (title, slug, category, excerpt, body, published_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  for (let page = 1; page <= maxPage; page++) {
    const html = page === 1 ? firstHtml : await fetchPage(`${BASE}/blog?page=${page}`);
    const { items } = parseNewsListPage(html);

    for (const item of items) {
      let body = '';
      if (opts.fetchBodies) {
        try {
          const articleHtml = await fetchPage(item.url, 200);
          body = parseNewsArticle(articleHtml, item.excerpt, item.coverImage);
        } catch {
          body = parseNewsArticle('', item.excerpt, item.coverImage);
        }
      } else {
        body = parseNewsArticle('', item.excerpt, item.coverImage);
      }

      const excerpt = buildNewsExcerpt(null, body) || null;

      insert.run(item.title, item.slug, item.category, excerpt, body, item.publishedAt);
      imported++;
    }
    console.log(`  страница ${page}/${maxPage}, всего ${imported}`);
  }
  console.log(`  ✓ ${imported} новостей`);
}

async function importPlayers(): Promise<void> {
  console.log('→ Группы и игроки...');
  const html = await fetchPage(`${BASE}/gruppy`);
  const groupsData = parseGroupsPage(html);
  const chudoSection = groupsData.get(CHUDO_MASTER_SLUG);
  const chudoPlayers = chudoSection?.players ?? [];
  groupsData.delete(CHUDO_MASTER_SLUG);
  let count = 0;

  const linkGroup = db.prepare(
    'INSERT OR REPLACE INTO group_players (group_id, player_id, number) VALUES (?, ?, ?)'
  );
  const updateGroupPhoto = db.prepare('UPDATE groups SET photo = ? WHERE id = ?');

  for (const [groupSlug, section] of groupsData) {
    const groupId = getGroupIdBySlug(groupSlug);
    if (!groupId) {
      console.warn(`  ! группа не найдена: ${groupSlug}`);
      continue;
    }

    if (section.photo) {
      updateGroupPhoto.run(section.photo, groupId);
    }

    for (const player of section.players) {
      const playerId = upsertPlayer(player, { isGraduate: false });
      linkGroup.run(groupId, playerId, player.number);
      count++;
    }
  }

  const chudoGroupId = getGroupIdBySlug(CHUDO_MASTER_SLUG);
  if (chudoGroupId && chudoSection?.photo) {
    updateGroupPhoto.run(chudoSection.photo, chudoGroupId);
  }

  for (const player of chudoPlayers) {
    markChudoMasterPlayer(player);
  }

  console.log(`  ✓ ${count} игроков в группах, ${chudoPlayers.length} в Чу-До Мастер`);
}

async function importGraduates(): Promise<void> {
  console.log('→ Воспитанники...');
  const html = await fetchPage(`${BASE}/vospitanniki`);
  const graduates = parseGraduatesPage(html);

  graduates.forEach((player, index) => {
    upsertPlayer(player, {
      isGraduate: true,
      isFeatured: index < 12,
      sortOrder: index,
    });
  });
  console.log(`  ✓ ${graduates.length} воспитанников`);
}

async function importSchedule(): Promise<void> {
  console.log('→ Расписание...');
  const html = await fetchPage(`${BASE}/raspisanie`);
  const { year, month, groupNames, rows } = parseSchedulePage(html);

  db.prepare('DELETE FROM schedule_entries WHERE month_id IN (SELECT id FROM schedule_months WHERE year=? AND month=?)').run(
    year,
    month
  );
  db.prepare('DELETE FROM schedule_months WHERE year=? AND month=?').run(year, month);

  const monthResult = db
    .prepare('INSERT INTO schedule_months (year, month, title) VALUES (?, ?, ?)')
    .run(year, month, `${month}.${year}`);
  const monthId = Number(monthResult.lastInsertRowid);

  const groupIds = groupNames.map((name) => {
    const slug = GROUP_BY_TITLE[name];
    return slug ? getGroupIdBySlug(slug) : undefined;
  });

  const insertEntry = db.prepare(
    `INSERT INTO schedule_entries (month_id, day, weekday, group_id, time_start, time_end, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  let entries = 0;
  for (const row of rows) {
    row.slots.forEach((cell, index) => {
      if (!cell || !groupIds[index]) return;
      const parsed = parseTimeRange(cell);
      if (!parsed) return;
      insertEntry.run(monthId, row.day, row.weekday, groupIds[index], parsed.start, parsed.end, parsed.note || null);
      entries++;
    });
  }
  console.log(`  ✓ ${entries} записей расписания (${month}/${year})`);
}

async function importVizitka(): Promise<void> {
  console.log('→ Визитка...');
  const html = await fetchPage(`${BASE}/vizitka`);
  const { title, intro, coaches, footer, footerPhoto } = parseVizitkaPage(html);
  db.prepare('DELETE FROM vizitka_coaches').run();
  db.prepare('DELETE FROM vizitka_sections').run();
  db.prepare('INSERT INTO vizitka_sections (title, body, sort_order) VALUES (?, ?, 1)').run(title, intro);
  if (footer) {
    db.prepare('INSERT INTO vizitka_sections (title, body, image, sort_order) VALUES (?, ?, ?, 2)').run(
      'Арена',
      footer,
      footerPhoto
    );
  }
  const insertCoach = db.prepare(
    'INSERT INTO vizitka_coaches (photo, role, name, bio, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  coaches.forEach((coach, i) => {
    insertCoach.run(coach.photo, coach.role, coach.name, coach.bio, i + 1);
  });
  console.log(`  ✓ визитка: ${coaches.length} тренеров`);
}

async function importVideos(): Promise<void> {
  console.log('→ Видео...');
  const html = await fetchPage(`${BASE}/`);
  const videos = parseHomeVideos(html);
  db.prepare('DELETE FROM videos').run();
  const insert = db.prepare('INSERT INTO videos (title, youtube_url, sort_order) VALUES (?, ?, ?)');
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const title = await resolveYoutubeTitle(video.url, `FC Fortuna TV #${i + 1}`);
    insert.run(title, video.url, i);
    if (i < videos.length - 1) await sleep(150);
  }
  console.log(`  ✓ ${videos.length} видео`);
}

async function importSettings(): Promise<void> {
  console.log('→ Настройки главной...');
  const html = await fetchPage(`${BASE}/`);
  const settings = parseHomeSettings(html);
  const upsert = db.prepare(
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(settings)) {
    if (value) upsert.run(key, value);
  }
  console.log('  ✓ текст набора импортирован');
}

async function importArchive(): Promise<void> {
  console.log('→ Архив...');
  const html = await fetchPage(`${BASE}/arhiv`);
  const years = parseYearLinks(html, '/arhiv');

  const insertYear = db.prepare(
    `INSERT OR IGNORE INTO archive_years (year, type) VALUES (?, 'archive')`
  );
  const getYearId = db.prepare(`SELECT id FROM archive_years WHERE year=? AND type='archive'`);
  const insertItem = db.prepare(
    `INSERT OR IGNORE INTO archive_items (year_id, title, slug, sort_order) VALUES (?, ?, ?, ?)`
  );

  let total = 0;
  for (const year of years) {
    insertYear.run(year);
    const yearRow = queryRow<{ id: number }>(getYearId.get(year));
    if (!yearRow) continue;

    const yearHtml = await fetchPage(`${BASE}/arhiv/${year}`, 250);
    const items = parseArchiveYearItems(yearHtml, year);
    items.forEach((item, index) => {
      insertItem.run(yearRow.id, item.title, item.slug, index);
      total++;
    });
    console.log(`  ${year}: ${items.length} материалов`);
  }
  console.log(`  ✓ ${total} записей архива`);
}

async function importGallery(opts: ImportOptions): Promise<void> {
  console.log('→ Фотогалерея...');
  const html = await fetchPage(`${BASE}/fotogalereya`);
  const years = parseYearLinks(html, '/fotogalereya');

  const insertYear = db.prepare(
    `INSERT OR IGNORE INTO archive_years (year, type) VALUES (?, 'gallery')`
  );
  const getYearId = db.prepare(`SELECT id FROM archive_years WHERE year=? AND type='gallery'`);
  const insertItem = db.prepare(
    `INSERT OR IGNORE INTO archive_items (year_id, title, slug, cover_image, sort_order) VALUES (?, ?, ?, ?, ?)`
  );
  const insertPhoto = db.prepare(
    `INSERT INTO archive_photos (item_id, filename, sort_order) VALUES (?, ?, ?)`
  );

  let total = 0;
  for (const year of years) {
    insertYear.run(year);
    const yearRow = queryRow<{ id: number }>(getYearId.get(year));
    if (!yearRow) continue;

    const yearHtml = await fetchPage(`${BASE}/fotogalereya/${year}`, 250);
    const items = parseGalleryYearItems(yearHtml, year);

    for (const [index, item] of items.entries()) {
      let cover: string | null = null;
      const itemResult = insertItem.run(yearRow.id, item.title, item.slug, null, index);
      const itemId = Number(itemResult.lastInsertRowid);

      if (opts.galleryPhotos && item.url) {
        try {
          const albumHtml = await fetchPage(item.url, 150);
          const photos = parseGalleryPhotos(albumHtml);
          if (photos.length) {
            cover = photos[0];
            db.prepare('UPDATE archive_items SET cover_image=? WHERE id=?').run(cover, itemId);
            photos.forEach((photo, pi) => insertPhoto.run(itemId, photo, pi));
          }
        } catch {
          // skip album photos on error
        }
      }
      total++;
    }
    console.log(`  ${year}: ${items.length} альбомов`);
  }
  console.log(`  ✓ ${total} альбомов`);
}

async function main(): Promise<void> {
  const opts = parseArgs();
  runMigrations();

  console.log('Импорт данных с fcfortuna.by');
  console.log('Разделы:', [...opts.sections].join(', '));
  console.log('');

  const allSections = [
    'news', 'players', 'graduates', 'schedule', 'vizitka', 'videos', 'settings', 'archive', 'gallery',
  ];
  if (allSections.every((s) => opts.sections.has(s))) {
    clearAllContent();
  } else {
    clearSections(opts.sections);
  }

  if (opts.sections.has('players')) await importPlayers();
  if (opts.sections.has('graduates')) await importGraduates();
  if (opts.sections.has('schedule')) await importSchedule();
  if (opts.sections.has('vizitka')) await importVizitka();
  if (opts.sections.has('videos')) await importVideos();
  if (opts.sections.has('settings')) await importSettings();
  if (opts.sections.has('news')) await importNews(opts);
  if (opts.sections.has('archive')) await importArchive();
  if (opts.sections.has('gallery')) await importGallery(opts);

  console.log('');
  console.log('Импорт завершён.');
}

main().catch((err) => {
  console.error('Ошибка импорта:', err);
  process.exit(1);
});
