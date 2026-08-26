import path from 'path';
import type { Request } from 'express';
import type { FileFilterCallback } from 'multer';

const ALLOWED_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.jfif',
  '.heic',
  '.heif',
  '.avif',
]);
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-windows-bmp',
  'image/heic',
  'image/heif',
  'image/avif',
]);

export function imageFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (ext === '.svg' || mime === 'image/svg+xml') {
    cb(null, false);
    return;
  }
  if (!file.originalname && !mime) {
    cb(null, false);
    return;
  }
  if (ALLOWED_MIME.has(mime) || mime.startsWith('image/') || ALLOWED_EXT.has(ext)) {
    cb(null, true);
    return;
  }
  cb(null, false);
}
