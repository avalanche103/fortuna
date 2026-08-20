import session from 'express-session';
import db from './index';

export function ensureSessionTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
  `);
}

export class SqliteSessionStore extends session.Store {
  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void): void {
    try {
      const row = db.prepare('SELECT sess, expired FROM sessions WHERE sid = ?').get(sid) as
        | { sess: string; expired: number }
        | undefined;
      if (!row) {
        callback(null, null);
        return;
      }
      if (row.expired < Date.now()) {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.sess) as session.SessionData);
    } catch (err) {
      callback(err);
    }
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    try {
      const expires = sess.cookie?.expires
        ? new Date(sess.cookie.expires as Date).getTime()
        : Date.now() + 24 * 60 * 60 * 1000;
      db.prepare(
        `INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired`
      ).run(sid, JSON.stringify(sess), expires);
      if (Math.random() < 0.02) {
        db.prepare('DELETE FROM sessions WHERE expired < ?').run(Date.now());
      }
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    this.set(sid, sess, callback);
  }
}
