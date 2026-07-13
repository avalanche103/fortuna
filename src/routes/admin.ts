import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import slugify from 'slugify';
import db from '../db';
import { queryRows } from '../db/helpers';
import { requireAdmin, verifyAdmin, getAdminId } from '../middleware/auth';
import { getRosterGroups, getSettings } from '../services/content';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.get('/login', (req: Request, res: Response) => {
  if (req.session.adminId) {
    res.redirect('/admin');
    return;
  }
  res.render('admin/login', { title: 'Вход', error: null });
});

router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!verifyAdmin(username, password)) {
    res.render('admin/login', { title: 'Вход', error: 'Неверный логин или пароль' });
    return;
  }
  req.session.adminId = getAdminId(username);
  res.redirect('/admin');
});

router.post('/logout', requireAdmin, (req: Request, res: Response) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/', requireAdmin, (_req: Request, res: Response) => {
  const stats = {
    news: (db.prepare('SELECT COUNT(*) as c FROM news').get() as { c: number }).c,
    players: (db.prepare('SELECT COUNT(*) as c FROM players').get() as { c: number }).c,
    groups: (db.prepare('SELECT COUNT(*) as c FROM groups').get() as { c: number }).c,
    videos: (db.prepare('SELECT COUNT(*) as c FROM videos').get() as { c: number }).c,
  };
  res.render('admin/dashboard', { title: 'Админ-панель', stats });
});

// --- News ---
router.get('/news', requireAdmin, (_req, res) => {
  const news = db.prepare('SELECT * FROM news ORDER BY published_at DESC').all();
  res.render('admin/news-list', { title: 'Новости', news });
});

router.get('/news/new', requireAdmin, (_req, res) => {
  res.render('admin/news-form', { title: 'Новая новость', article: null });
});

router.get('/news/:id/edit', requireAdmin, (req, res) => {
  const article = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!article) {
    res.status(404).send('Not found');
    return;
  }
  res.render('admin/news-form', { title: 'Редактировать новость', article });
});

router.post('/news', requireAdmin, (req, res) => {
  const { title, category, excerpt, body, published_at, is_pinned } = req.body;
  const slug = slugify(title, { lower: true, strict: true, locale: 'ru' });
  db.prepare(
    `INSERT INTO news (title, slug, category, excerpt, body, is_pinned, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(title, slug, category || 'novosti', excerpt || null, body, is_pinned ? 1 : 0, published_at);
  res.redirect('/admin/news');
});

router.post('/news/:id', requireAdmin, (req, res) => {
  const { title, category, excerpt, body, published_at, is_pinned } = req.body;
  db.prepare(
    `UPDATE news SET title=?, category=?, excerpt=?, body=?, is_pinned=?, published_at=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(title, category || 'novosti', excerpt || null, body, is_pinned ? 1 : 0, published_at, req.params.id);
  res.redirect('/admin/news');
});

router.post('/news/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  res.redirect('/admin/news');
});

// --- Players ---
router.get('/players', requireAdmin, (_req, res) => {
  const players = db.prepare('SELECT * FROM players ORDER BY is_graduate DESC, sort_order, name').all();
  res.render('admin/players-list', { title: 'Игроки', players });
});

router.get('/players/new', requireAdmin, (_req, res) => {
  res.render('admin/player-form', { title: 'Новый игрок', player: null, groups: getGroups() });
});

router.get('/players/:id/edit', requireAdmin, (req, res) => {
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!player) {
    res.status(404).send('Not found');
    return;
  }
  const groupIds = queryRows<{ group_id: number }>(
    db.prepare('SELECT group_id FROM group_players WHERE player_id = ?').all(req.params.id)
  ).map((r) => r.group_id);
  res.render('admin/player-form', {
    title: 'Редактировать игрока',
    player: { ...player as object, groupIds },
    groups: getRosterGroups(),
  });
});

router.post('/players', requireAdmin, upload.single('photo'), (req, res) => {
  const { name, birth_date, position, club, bio, is_graduate, is_featured, is_chudo_master, sort_order, group_ids } = req.body;
  const slug = slugify(name, { lower: true, strict: true, locale: 'ru' });
  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db
    .prepare(
      `INSERT INTO players (name, slug, birth_date, position, club, bio, photo, is_graduate, is_featured, is_chudo_master, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name, slug, birth_date || null, position || null, club || null, bio || null, photo,
      is_graduate ? 1 : 0, is_featured ? 1 : 0, is_chudo_master ? 1 : 0, parseInt(sort_order, 10) || 0
    );
  syncPlayerGroups(Number(result.lastInsertRowid), group_ids);
  res.redirect('/admin/players');
});

router.post('/players/:id', requireAdmin, upload.single('photo'), (req, res) => {
  const { name, birth_date, position, club, bio, is_graduate, is_featured, is_chudo_master, sort_order, group_ids } = req.body;
  const existing = db.prepare('SELECT photo FROM players WHERE id = ?').get(req.params.id) as { photo: string | null };
  const photo = req.file ? `/uploads/${req.file.filename}` : existing?.photo;
  db.prepare(
    `UPDATE players SET name=?, birth_date=?, position=?, club=?, bio=?, photo=?, is_graduate=?, is_featured=?, is_chudo_master=?, sort_order=?
     WHERE id=?`
  ).run(
    name, birth_date || null, position || null, club || null, bio || null, photo,
    is_graduate ? 1 : 0, is_featured ? 1 : 0, is_chudo_master ? 1 : 0, parseInt(sort_order, 10) || 0, req.params.id
  );
  syncPlayerGroups(parseInt(req.params.id, 10), group_ids);
  res.redirect('/admin/players');
});

function syncPlayerGroups(playerId: number, groupIds: string | string[] | undefined): void {
  db.prepare('DELETE FROM group_players WHERE player_id = ?').run(playerId);
  const ids = Array.isArray(groupIds) ? groupIds : groupIds ? [groupIds] : [];
  const insert = db.prepare('INSERT INTO group_players (group_id, player_id) VALUES (?, ?)');
  for (const gid of ids) {
    if (gid) insert.run(parseInt(gid, 10), playerId);
  }
}

// --- Videos ---
router.get('/videos', requireAdmin, (_req, res) => {
  const videos = db.prepare('SELECT * FROM videos ORDER BY sort_order').all();
  res.render('admin/videos-list', { title: 'Видео', videos });
});

router.post('/videos', requireAdmin, (req, res) => {
  const { title, youtube_url, sort_order } = req.body;
  db.prepare('INSERT INTO videos (title, youtube_url, sort_order) VALUES (?, ?, ?)').run(
    title, youtube_url, parseInt(sort_order, 10) || 0
  );
  res.redirect('/admin/videos');
});

router.post('/videos/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
  res.redirect('/admin/videos');
});

// --- Settings ---
router.get('/settings', requireAdmin, (_req, res) => {
  res.render('admin/settings', { title: 'Настройки сайта', settings: getSettings() });
});

router.post('/settings', requireAdmin, (req, res) => {
  const upsert = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [key, value] of Object.entries(req.body)) {
    if (typeof value === 'string') upsert.run(key, value);
  }
  res.redirect('/admin/settings');
});

// --- Vizitka ---
router.get('/vizitka', requireAdmin, (_req, res) => {
  const sections = db.prepare('SELECT * FROM vizitka_sections ORDER BY sort_order').all();
  res.render('admin/vizitka', { title: 'Визитка', sections });
});

router.post('/vizitka', requireAdmin, (req, res) => {
  const { id, title, body, sort_order } = req.body;
  if (id) {
    db.prepare('UPDATE vizitka_sections SET title=?, body=?, sort_order=? WHERE id=?').run(
      title, body, parseInt(sort_order, 10) || 0, id
    );
  } else {
    db.prepare('INSERT INTO vizitka_sections (title, body, sort_order) VALUES (?, ?, ?)').run(
      title, body, parseInt(sort_order, 10) || 0
    );
  }
  res.redirect('/admin/vizitka');
});

export default router;
