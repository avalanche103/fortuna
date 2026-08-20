import fs from 'fs';
import path from 'path';
import { DATA_DIR, DB_PATH, ensureDataDirs } from '../src/paths';
import db from '../src/db';

ensureDataDirs();

const stamp = new Date().toISOString().slice(0, 10);
const backupDir = path.join(DATA_DIR, 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const dest = path.join(backupDir, `fortuna-${stamp}.db`);

try {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
} catch {
  /* still copy */
}

try {
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  console.log(`Backup written to ${dest}`);
} catch (err) {
  fs.copyFileSync(DB_PATH, dest);
  console.log(`VACUUM INTO unavailable, copied ${dest}`);
  console.warn(err);
}
