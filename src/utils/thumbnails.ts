import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, UPLOAD_DIR } from '../paths';

export const THUMB_WIDTH = 480;

export function thumbnailUrl(src: string | null | undefined, width = THUMB_WIDTH): string {
  if (!src) return '';
  if (!src.startsWith('/uploads/')) return src;
  return `/img/thumb?w=${width}&src=${encodeURIComponent(src)}`;
}

function safeUploadPath(src: string): string | null {
  if (!src.startsWith('/uploads/')) return null;
  const relative = src.slice('/uploads/'.length).replace(/\\/g, '/');
  if (!relative || relative.split('/').includes('..')) return null;
  const absolute = path.resolve(UPLOAD_DIR, relative);
  const root = path.resolve(UPLOAD_DIR);
  const rel = path.relative(root, absolute);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return absolute;
}

export async function getOrCreateThumbnail(src: string, width = THUMB_WIDTH): Promise<string | null> {
  const sourcePath = safeUploadPath(src);
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;

  const thumbDir = path.join(DATA_DIR, 'thumbs');
  fs.mkdirSync(thumbDir, { recursive: true });
  const hash = crypto.createHash('sha1').update(`${width}:${sourcePath}`).digest('hex');
  const thumbPath = path.join(thumbDir, `${hash}.jpg`);
  if (fs.existsSync(thumbPath)) return thumbPath;

  try {
    const sharp = (await import('sharp')).default;
    await sharp(sourcePath)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toFile(thumbPath);
    return thumbPath;
  } catch {
    return null;
  }
}
