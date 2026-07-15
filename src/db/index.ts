import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { queryRow, queryRows } from './helpers';
import { buildNewsExcerpt } from '../utils/news-text';
import { DATA_DIR, DB_PATH, ensureDataDirs } from '../paths';

ensureDataDirs();

export const db = new DatabaseSync(DB_PATH);

// Concurrent readers (site) + writers (import/download) coexist better in WAL.
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA synchronous = NORMAL');

export function runMigrations(): void {
  const compiledSchemaPath = path.join(__dirname, 'schema.sql');
  const schemaPath = fs.existsSync(compiledSchemaPath)
    ? compiledSchemaPath
    : path.join(process.cwd(), 'src', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  applySchemaPatches();
}

function applySchemaPatches(): void {
  patchScheduleSchema();

  const playerCols = db.prepare('PRAGMA table_info(players)').all() as { name: string }[];
  if (!playerCols.some((c) => c.name === 'is_chudo_master')) {
    db.exec('ALTER TABLE players ADD COLUMN is_chudo_master INTEGER NOT NULL DEFAULT 0');
  }

  const groupCols = db.prepare('PRAGMA table_info(groups)').all() as { name: string }[];
  if (!groupCols.some((c) => c.name === 'is_schedule_only')) {
    db.exec('ALTER TABLE groups ADD COLUMN is_schedule_only INTEGER NOT NULL DEFAULT 0');
  }
  if (!groupCols.some((c) => c.name === 'photo')) {
    db.exec('ALTER TABLE groups ADD COLUMN photo TEXT');
  }

  const vizitkaCols = db.prepare('PRAGMA table_info(vizitka_sections)').all() as { name: string }[];
  if (!vizitkaCols.some((c) => c.name === 'image')) {
    db.exec('ALTER TABLE vizitka_sections ADD COLUMN image TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS vizitka_coaches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      bio TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.prepare(`UPDATE groups SET is_schedule_only = 1 WHERE slug = 'chu-do-master'`).run();

  const chudoGroup = db.prepare(`SELECT id FROM groups WHERE slug = 'chu-do-master'`).get() as
    | { id: number }
    | undefined;
  if (chudoGroup) {
    db.prepare(
      `UPDATE players SET is_chudo_master = 1
       WHERE id IN (SELECT player_id FROM group_players WHERE group_id = ?)`
    ).run(chudoGroup.id);
    db.prepare('DELETE FROM group_players WHERE group_id = ?').run(chudoGroup.id);
  }

  refreshNewsExcerpts();
  mergeChudoMasterDuplicates();
}

function patchScheduleSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#6b7280',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `);

  const entryCols = db.prepare('PRAGMA table_info(schedule_entries)').all() as { name: string }[];
  if (!entryCols.some((column) => column.name === 'location_id')) {
    db.exec('ALTER TABLE schedule_entries ADD COLUMN location_id INTEGER REFERENCES schedule_locations(id)');
  }

  const locations = [
    ['Стадион «Зеленый Луг»', 'ул. Гамарника, 9/1', '#86d993', 10],
    ['Спорткомплекс РЦОП по гандболу', 'ул. Филимонова, 55/2', '#4f8fd8', 20],
    ['Футбольный манеж', 'пр. Победителей, 20/2', '#177245', 30],
    ['Спорткомплекс «Ампласт»', 'ул. Седых, 66', '#f2cf52', 40],
  ] as const;
  const insertLocation = db.prepare(
    `INSERT INTO schedule_locations (name, address, color, sort_order)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO NOTHING`
  );
  for (const location of locations) insertLocation.run(...location);

  const legacyLocations = queryRows<{ location: string }>(
    db.prepare(
      `SELECT DISTINCT trim(location) AS location
       FROM schedule_entries
       WHERE location IS NOT NULL AND trim(location) != '' AND location_id IS NULL`
    ).all()
  );
  for (const row of legacyLocations) {
    insertLocation.run(row.location, '', '#6b7280', 100);
  }
  db.exec(`
    UPDATE schedule_entries
    SET location_id = (
      SELECT id FROM schedule_locations
      WHERE lower(trim(schedule_locations.name)) = lower(trim(schedule_entries.location))
      LIMIT 1
    )
    WHERE location_id IS NULL AND location IS NOT NULL AND trim(location) != '';

    DELETE FROM schedule_entries
    WHERE id NOT IN (
      SELECT MAX(id) FROM schedule_entries GROUP BY month_id, day, group_id
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_slot
    ON schedule_entries(month_id, day, group_id);
  `);
}

function refreshNewsExcerpts(): void {
  const rows = queryRows<{ id: number; excerpt: string | null; body: string }>(
    db.prepare('SELECT id, excerpt, body FROM news').all()
  );
  const update = db.prepare('UPDATE news SET excerpt = ? WHERE id = ?');
  for (const row of rows) {
    const excerpt = buildNewsExcerpt(null, row.body);
    if (excerpt !== (row.excerpt ?? '')) {
      update.run(excerpt || null, row.id);
    }
  }
}

function mergeChudoMasterDuplicates(): void {
  const duplicates = queryRows<{ chudo_id: number; name: string; chudo_slug: string }>(
    db.prepare(
      `SELECT c.id AS chudo_id, c.name, c.slug AS chudo_slug
       FROM players c
       WHERE c.is_chudo_master = 1
       AND NOT EXISTS (SELECT 1 FROM group_players gp WHERE gp.player_id = c.id)`
    ).all()
  );

  for (const dup of duplicates) {
    const baseSlug = dup.chudo_slug.replace(/_\d+$/, '');
    const main = queryRow<{ id: number }>(
      db.prepare(
        `SELECT id FROM players
         WHERE id != ? AND is_graduate = 0 AND (slug = ? OR slug = ? OR name = ?)
         ORDER BY
           CASE WHEN name = ? THEN 0 WHEN slug = ? THEN 1 WHEN slug = ? THEN 2 ELSE 3 END,
           EXISTS (SELECT 1 FROM group_players WHERE player_id = players.id) DESC
         LIMIT 1`
      ).get(dup.chudo_id, dup.chudo_slug, baseSlug, dup.name, dup.name, dup.chudo_slug, baseSlug)
    );
    if (!main) continue;

    db.prepare('UPDATE players SET is_chudo_master = 1 WHERE id = ?').run(main.id);
    db.prepare('DELETE FROM players WHERE id = ?').run(dup.chudo_id);
  }
}

export default db;
