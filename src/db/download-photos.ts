import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db, { runMigrations } from './index';
import { queryRow, queryRows } from './helpers';
import { fetchPage, absUrl, sleep, isPlaceholderPhoto, normalizePlayerSlug } from './importer/utils';
import {
  parseGalleryPhotos,
  parseGalleryYearItems,
  parseGroupsPage,
  parseGraduatesPage,
  parseYearLinks,
} from './importer/parsers';

const BASE = 'https://fcfortuna.by';
const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads');
const MANIFEST_PATH = path.join(UPLOAD_ROOT, '.download-manifest.json');

interface Manifest {
  [url: string]: string;
}

function loadManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
}

function saveManifest(manifest: Manifest): void {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function isRemoteUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('http') || url.startsWith('//');
}

function localFileName(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return crypto.createHash('md5').update(url).digest('hex') + '.jpg';
  }
  const ext = path.extname(parsed.pathname) || '.jpg';
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 10);
  const base = path
    .basename(decodeURIComponent(parsed.pathname))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 50);
  return `${hash}_${base || 'image'}${ext}`;
}

async function downloadImage(url: string, subdir: string, manifest: Manifest): Promise<string | null> {
  const absolute = absUrl(url);
  if (!absolute || !isRemoteUrl(absolute)) return url || null;

  if (manifest[absolute]) {
    const existing = path.join(UPLOAD_ROOT, manifest[absolute]);
    if (fs.existsSync(existing)) return `/uploads/${manifest[absolute].replace(/\\/g, '/')}`;
  }

  const dir = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });

  const fileName = localFileName(absolute);
  const relPath = path.join(subdir, fileName).replace(/\\/g, '/');
  const fullPath = path.join(UPLOAD_ROOT, subdir, fileName);

  if (fs.existsSync(fullPath)) {
    manifest[absolute] = relPath;
    return `/uploads/${relPath}`;
  }

  try {
    const response = await fetch(absolute, {
      headers: { 'User-Agent': 'FCFortunaPhotoDownloader/1.0' },
    });
    if (!response.ok) {
      console.warn(`  ! HTTP ${response.status}: ${absolute}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 100) return null;
    fs.writeFileSync(fullPath, buffer);
    manifest[absolute] = relPath;
    await sleep(80);
    return `/uploads/${relPath}`;
  } catch (err) {
    console.warn(`  ! Ошибка: ${absolute}`, err instanceof Error ? err.message : err);
    return null;
  }
}

function extractImageUrls(html: string): string[] {
  const urls = new Set<string>();
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const src = match[1];
    if (src && !src.includes('kk.png') && !src.includes('ball.gif') && !src.includes('logo')) {
      urls.add(absUrl(src));
    }
  }
  return [...urls];
}

async function replaceHtmlImages(html: string, subdir: string, manifest: Manifest): Promise<string> {
  if (!html) return html;
  let result = html;
  for (const url of extractImageUrls(html)) {
    const local = await downloadImage(url, subdir, manifest);
    if (local) result = result.split(url).join(local);
  }
  return result;
}

async function downloadPlayerPhotos(manifest: Manifest): Promise<number> {
  console.log('→ Фото игроков и воспитанников...');
  let count = 0;

  const findPlayer = (slug: string, name: string) => {
    const baseSlug = normalizePlayerSlug(slug);
    return queryRow<{ id: number; photo: string | null }>(
      db.prepare(
        `SELECT id, photo FROM players
         WHERE slug = ? OR slug = ? OR name = ?
         ORDER BY CASE WHEN slug = ? THEN 0 WHEN slug = ? THEN 1 ELSE 2 END
         LIMIT 1`
      ).get(slug, baseSlug, name, slug, baseSlug)
    );
  };

  for (const page of [`${BASE}/gruppy`, `${BASE}/vospitanniki`]) {
    const html = await fetchPage(page, 200);
    const players =
      page.includes('gruppy') ? [...parseGroupsPage(html).values()].flat() : parseGraduatesPage(html);

    for (const player of players) {
      if (!player.photo || isPlaceholderPhoto(player.photo)) continue;
      const local = await downloadImage(player.photo, 'players', manifest);
      if (!local || isPlaceholderPhoto(local)) continue;

      const existing = findPlayer(player.slug, player.name);
      if (existing) {
        if (isPlaceholderPhoto(local) && existing.photo && !isPlaceholderPhoto(existing.photo)) continue;
        db.prepare('UPDATE players SET photo = ? WHERE id = ?').run(local, existing.id);
      }
      count++;
    }
  }
  console.log(`  ✓ ${count} фото игроков`);
  return count;
}

async function downloadGalleryPhotos(manifest: Manifest): Promise<number> {
  console.log('→ Фотогалерея (все альбомы)...');
  let photoCount = 0;
  let albumCount = 0;

  const listHtml = await fetchPage(`${BASE}/fotogalereya`, 200);
  const years = parseYearLinks(listHtml, '/fotogalereya');

  const getYearId = db.prepare(`SELECT id FROM archive_years WHERE year=? AND type='gallery'`);
  const insertYear = db.prepare(`INSERT OR IGNORE INTO archive_years (year, type) VALUES (?, 'gallery')`);
  const findItem = db.prepare(
    `SELECT ai.id FROM archive_items ai
     JOIN archive_years ay ON ay.id = ai.year_id
     WHERE ay.type='gallery' AND ay.year=? AND ai.slug=?`
  );
  const insertItem = db.prepare(
    `INSERT OR IGNORE INTO archive_items (year_id, title, slug, sort_order) VALUES (?, ?, ?, ?)`
  );
  const deletePhotos = db.prepare('DELETE FROM archive_photos WHERE item_id = ?');
  const insertPhoto = db.prepare(
    `INSERT INTO archive_photos (item_id, filename, caption, sort_order) VALUES (?, ?, ?, ?)`
  );

  for (const year of years) {
    insertYear.run(year);
    const yearRow = queryRow<{ id: number }>(getYearId.get(year));
    if (!yearRow) continue;

    const yearHtml = await fetchPage(`${BASE}/fotogalereya/${year}`, 200);
    const items = parseGalleryYearItems(yearHtml, year);
    console.log(`  ${year}: ${items.length} альбомов...`);

    for (const [index, item] of items.entries()) {
      let itemRow = queryRow<{ id: number }>(findItem.get(year, item.slug));
      if (!itemRow) {
        insertItem.run(yearRow.id, item.title, item.slug, index);
        itemRow = queryRow<{ id: number }>(findItem.get(year, item.slug));
      }
      if (!itemRow) continue;

      try {
        const albumHtml = await fetchPage(item.url, 120);
        const urls = parseGalleryPhotos(albumHtml);
        if (!urls.length) continue;

        deletePhotos.run(itemRow.id);
        let cover: string | null = null;

        for (const [pi, url] of urls.entries()) {
          const local = await downloadImage(url, `gallery/${year}`, manifest);
          if (!local) continue;
          if (!cover) cover = local;
          insertPhoto.run(itemRow.id, local, null, pi);
          photoCount++;
        }

        if (cover) {
          db.prepare('UPDATE archive_items SET cover_image=? WHERE id=?').run(cover, itemRow.id);
        }
        albumCount++;
      } catch (err) {
        console.warn(`  ! альбом ${item.slug}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`  ✓ ${photoCount} фото в ${albumCount} альбомах`);
  return photoCount;
}

async function downloadNewsImages(manifest: Manifest): Promise<number> {
  console.log('→ Фото в новостях...');
  const rows = queryRows<{ id: number; excerpt: string | null; body: string }>(
    db.prepare('SELECT id, excerpt, body FROM news').all()
  );
  if (!rows.length) {
    console.log('  (новостей в БД нет — пропуск)');
    return 0;
  }

  let count = 0;
  for (const row of rows) {
    const excerpt = row.excerpt ? await replaceHtmlImages(row.excerpt, 'news', manifest) : null;
    const body = row.body ? await replaceHtmlImages(row.body, 'news', manifest) : null;
    if (excerpt !== row.excerpt || body !== row.body) {
      db.prepare('UPDATE news SET excerpt=?, body=? WHERE id=?').run(excerpt, body, row.id);
      count++;
    }
  }
  console.log(`  ✓ обновлено ${count} новостей с картинками`);
  return count;
}

async function downloadVizitkaImages(manifest: Manifest): Promise<number> {
  console.log('→ Фото визитки...');
  const sections = queryRows<{ id: number; body: string }>(
    db.prepare('SELECT id, body FROM vizitka_sections').all()
  );
  if (!sections.length) {
    const html = await fetchPage(`${BASE}/vizitka`, 200);
    const urls = extractImageUrls(html);
    let count = 0;
    for (const url of urls) {
      if (await downloadImage(url, 'vizitka', manifest)) count++;
    }
    console.log(`  ✓ ${count} фото`);
    return count;
  }

  let count = 0;
  for (const section of sections) {
    const body = await replaceHtmlImages(section.body, 'vizitka', manifest);
    if (body !== section.body) {
      db.prepare('UPDATE vizitka_sections SET body=? WHERE id=?').run(body, section.id);
      count++;
    }
  }
  console.log(`  ✓ обновлено ${count} разделов`);
  return count;
}

async function ensureBaseData(): Promise<void> {
  const newsCount = queryRow<{ c: number }>(db.prepare('SELECT COUNT(*) as c FROM news').get())?.c ?? 0;
  const galleryCount = queryRow<{ c: number }>(
    db.prepare(`SELECT COUNT(*) as c FROM archive_years WHERE type='gallery'`).get()
  )?.c ?? 0;

  if (newsCount === 0 || galleryCount === 0) {
    console.log('БД пуста — сначала импорт метаданных (npm run db:import)...');
    console.log('Запускаю импорт без фото (5-15 мин.)...\n');
    const { spawnSync } = await import('child_process');
    const result = spawnSync('npm', ['run', 'db:import'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
    });
    if (result.status !== 0) {
      throw new Error('Импорт метаданных не удался');
    }
    console.log('');
  }
}

async function main(): Promise<void> {
  runMigrations();
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : null;
  const shouldRun = (step: string) => !only || only.includes(step);

  const manifest = loadManifest();
  console.log('Скачивание фото с fcfortuna.by → public/uploads/');
  console.log(`Уже в кэше: ${Object.keys(manifest).length} файлов\n`);

  await ensureBaseData();

  if (shouldRun('players')) {
    await downloadPlayerPhotos(manifest);
    saveManifest(manifest);
  }
  if (shouldRun('gallery')) {
    await downloadGalleryPhotos(manifest);
    saveManifest(manifest);
  }
  if (shouldRun('news')) {
    await downloadNewsImages(manifest);
    saveManifest(manifest);
  }
  if (shouldRun('vizitka')) {
    await downloadVizitkaImages(manifest);
    saveManifest(manifest);
  }

  const totalFiles = Object.keys(manifest).length;
  console.log(`\nГотово. Всего файлов: ${totalFiles}`);
  console.log(`Папка: ${UPLOAD_ROOT}`);
}

main().catch((err) => {
  console.error('Ошибка:', err);
  process.exit(1);
});
