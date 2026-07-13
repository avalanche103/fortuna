import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import db from '../db';

declare module 'express-session' {
  interface SessionData {
    adminId?: number;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.adminId) {
    res.redirect('/admin/login');
    return;
  }
  next();
}

export function verifyAdmin(username: string, password: string): boolean {
  const admin = db
    .prepare('SELECT id, password_hash FROM admins WHERE username = ?')
    .get(username) as { id: number; password_hash: string } | undefined;
  if (!admin) return false;
  if (!bcrypt.compareSync(password, admin.password_hash)) return false;
  return true;
}

export function getAdminId(username: string): number | undefined {
  const admin = db.prepare('SELECT id FROM admins WHERE username = ?').get(username) as { id: number } | undefined;
  return admin?.id;
}
