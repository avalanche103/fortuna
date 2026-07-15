import fs from 'fs';
import path from 'path';

/** Persistent data root (SQLite). On Render set DATA_DIR=/var/data. */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'fortuna.db');

/** Uploads live on the persistent disk in production, otherwise in public/uploads. */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  (process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'uploads')
    : path.join(process.cwd(), 'public', 'uploads'));

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}
