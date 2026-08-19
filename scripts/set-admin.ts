import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import db, { runMigrations } from '../src/db';

function readPassword(): string | undefined {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const file = path.join(process.cwd(), '.admin-pass');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  return undefined;
}

const username = (process.env.ADMIN_USERNAME || 'fortuna').trim();
const password = readPassword();

if (!username || !password) {
  console.error('Usage: put the password in .admin-pass or set ADMIN_PASSWORD, then npm run db:set-admin');
  process.exit(1);
}

runMigrations();

const hash = bcrypt.hashSync(password, 10);
const existing = db.prepare('SELECT id FROM admins LIMIT 1').get() as { id: number } | undefined;

if (existing) {
  db.prepare('UPDATE admins SET username = ?, password_hash = ? WHERE id = ?').run(
    username,
    hash,
    existing.id
  );
} else {
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
}

db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
console.log(`Admin account set: ${username}`);
db.close();
