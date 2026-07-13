import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { queryRow, queryRows } from './helpers';
import { buildNewsExcerpt } from '../utils/news-text';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'fortuna.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

export function runMigrations(): void {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  applySchemaPatches();
}

function applySchemaPatches(): void {
  const playerCols = db.prepare('PRAGMA table_info(players)').all() as { name: string }[];
  if (!playerCols.some((c) => c.name === 'is_chudo_master')) {
    db.exec('ALTER TABLE players ADD COLUMN is_chudo_master INTEGER NOT NULL DEFAULT 0');
  }

  const groupCols = db.prepare('PRAGMA table_info(groups)').all() as { name: string }[];
  if (!groupCols.some((c) => c.name === 'is_schedule_only')) {
    db.exec('ALTER TABLE groups ADD COLUMN is_schedule_only INTEGER NOT NULL DEFAULT 0');
  }

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

function refreshNewsExcerpts(): void {
  const rows = queryRows<{ id: number; excerpt: string | null; body: string }>(
    db.prepare('SELECT id, excerpt, body FROM news').all()
  );
  const update = db.prepare('UPDATE news SET excerpt = ? WHERE id = ?');
  for (const row of rows) {
    const excerpt = buildNewsExcerpt(row.excerpt, row.body);
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
