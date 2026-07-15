import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import slugify from 'slugify';
import db from '../db';
import { queryRows } from '../db/helpers';
import { UPLOAD_DIR, ensureDataDirs } from '../paths';
import { requireAdmin, verifyAdmin, getAdminId } from '../middleware/auth';
import {
  copyScheduleMonth,
  createScheduleLocation,
  createScheduleMonth,
  getGroups,
  getRosterGroups,
  getScheduleEntries,
  getScheduleLocation,
  getScheduleLocations,
  getScheduleMonth,
  getScheduleMonths,
  getSettings,
  getVizitkaCoaches,
  getVizitkaSections,
  MONTH_NAMES,
  saveScheduleEntries,
  updateScheduleLocation,
} from '../services/content';
import type { ScheduleSlotInput } from '../services/content';
import { resolveYoutubeTitle } from '../utils/youtube';

ensureDataDirs();
const uploadDir = UPLOAD_DIR;
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const groupUploadDir = path.join(uploadDir, 'groups');
const groupStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(groupUploadDir, { recursive: true });
    cb(null, groupUploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const uploadGroupPhoto = multer({ storage: groupStorage, limits: { fileSize: 10 * 1024 * 1024 } });

const vizitkaUploadDir = path.join(uploadDir, 'vizitka');
const vizitkaCoachUploadDir = path.join(uploadDir, 'vizitka', 'coaches');
const vizitkaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(vizitkaUploadDir, { recursive: true });
    cb(null, vizitkaUploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const vizitkaCoachStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(vizitkaCoachUploadDir, { recursive: true });
    cb(null, vizitkaCoachUploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const uploadVizitkaImage = multer({ storage: vizitkaStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadVizitkaCoachPhoto = multer({
  storage: vizitkaCoachStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const newsUploadDir = path.join(uploadDir, 'news');
const newsStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(newsUploadDir, { recursive: true });
    cb(null, newsUploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});
const uploadNewsImage = multer({
  storage: newsStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|jpg)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Только изображения (JPEG, PNG, GIF, WebP)'));
  },
});

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
    schedule: (db.prepare('SELECT COUNT(*) as c FROM schedule_months').get() as { c: number }).c,
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

router.post('/news/upload-image', requireAdmin, (req, res) => {
  uploadNewsImage.single('image')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Ошибка загрузки' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Файл не получен' });
      return;
    }
    res.json({ url: `/uploads/news/${req.file.filename}` });
  });
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

// --- Groups ---
router.get('/groups', requireAdmin, (_req, res) => {
  res.render('admin/groups-list', { title: 'Группы', groups: getGroups() });
});

router.post('/groups/:id', requireAdmin, uploadGroupPhoto.single('photo'), (req, res) => {
  const existing = db.prepare('SELECT photo FROM groups WHERE id = ?').get(req.params.id) as
    | { photo: string | null }
    | undefined;
  if (!existing) {
    res.status(404).send('Not found');
    return;
  }
  let photo = existing.photo;
  if (req.body.remove_photo === '1') {
    photo = null;
  } else if (req.file) {
    photo = `/uploads/groups/${req.file.filename}`;
  }
  db.prepare('UPDATE groups SET photo = ? WHERE id = ?').run(photo, req.params.id);
  res.redirect('/admin/groups');
});

// --- Schedule ---
router.get('/schedule', requireAdmin, (req, res) => {
  const months = getScheduleMonths();
  const requestedYear = parseInt(String(req.query.year ?? ''), 10);
  const requestedMonth = parseInt(String(req.query.month ?? ''), 10);
  const selected =
    (isValidYearMonth(requestedYear, requestedMonth) && getScheduleMonth(requestedYear, requestedMonth)) ||
    months[0];
  res.render('admin/schedule', {
    title: 'Расписание',
    months,
    month: selected ?? null,
    monthName: selected ? MONTH_NAMES[selected.month - 1] : '',
    MONTH_NAMES,
    groups: getGroups(),
    entries: selected ? getScheduleEntries(selected.id) : [],
    locations: getScheduleLocations(true),
    daysInMonth: selected ? new Date(selected.year, selected.month, 0).getDate() : 0,
    saved: req.query.saved === '1',
  });
});

router.post('/schedule/month', requireAdmin, (req, res) => {
  const year = parseInt(String(req.body.year), 10);
  const monthNumber = parseInt(String(req.body.month), 10);
  if (!isValidYearMonth(year, monthNumber)) {
    res.status(400).send('Некорректный год или месяц');
    return;
  }
  const target = createScheduleMonth(year, monthNumber, cleanText(req.body.title) || null);
  const sourceId = parseInt(String(req.body.copy_from ?? ''), 10);
  if (Number.isFinite(sourceId) && sourceId !== target.id) {
    copyScheduleMonth(sourceId, target.id);
  }
  res.redirect(`/admin/schedule?year=${year}&month=${monthNumber}`);
});

router.post('/schedule/:year(\\d{4})/:month(\\d{1,2})', requireAdmin, (req, res) => {
  const year = parseInt(req.params.year, 10);
  const monthNumber = parseInt(req.params.month, 10);
  const month = isValidYearMonth(year, monthNumber) ? getScheduleMonth(year, monthNumber) : undefined;
  if (!month) {
    res.status(404).send('Месяц расписания не найден');
    return;
  }

  const groups = getGroups();
  const groupIds = new Set(groups.map((group) => group.id));
  const locationIds = new Set(getScheduleLocations(true).map((location) => location.id));
  const rawSlots = req.body.slots && typeof req.body.slots === 'object' ? req.body.slots : {};
  const slots: ScheduleSlotInput[] = [];
  const daysInMonth = new Date(year, monthNumber, 0).getDate();

  try {
    for (const [dayKey, dayValue] of Object.entries(rawSlots as Record<string, unknown>)) {
      const day = parseInt(dayKey.replace(/^d/, ''), 10);
      if (!Number.isInteger(day) || day < 1 || day > daysInMonth || !dayValue || typeof dayValue !== 'object') {
        throw new Error('Некорректная дата занятия');
      }
      for (const [groupKey, rawSlot] of Object.entries(dayValue as Record<string, unknown>)) {
        const groupId = parseInt(groupKey.replace(/^g/, ''), 10);
        if (!groupIds.has(groupId) || !rawSlot || typeof rawSlot !== 'object') {
          throw new Error('Некорректная группа');
        }
        const values = rawSlot as Record<string, unknown>;
        const timeStart = parseScheduleTime(values.time_start);
        const timeEnd = parseScheduleTime(values.time_end);
        if ((timeStart && !timeEnd) || (!timeStart && timeEnd)) {
          throw new Error(`Укажите начало и окончание занятия (${day} число)`);
        }
        if (timeStart && timeEnd && timeStart >= timeEnd) {
          throw new Error(`Время окончания должно быть позже начала (${day} число)`);
        }
        const locationId = parseInt(String(values.location_id ?? ''), 10);
        if (Number.isFinite(locationId) && !locationIds.has(locationId)) {
          throw new Error('Выбрана неизвестная площадка');
        }
        slots.push({
          day,
          groupId,
          timeStart,
          timeEnd,
          locationId: Number.isFinite(locationId) ? locationId : null,
          note: cleanText(values.note) || null,
        });
      }
    }
    saveScheduleEntries(month, slots);
  } catch (error) {
    res.status(400).send(error instanceof Error ? error.message : 'Не удалось сохранить расписание');
    return;
  }

  res.redirect(`/admin/schedule?year=${year}&month=${monthNumber}&saved=1`);
});

router.get('/schedule/locations', requireAdmin, (_req, res) => {
  res.render('admin/schedule-locations', {
    title: 'Площадки расписания',
    locations: getScheduleLocations(true),
    error: null,
  });
});

router.post('/schedule/locations', requireAdmin, (req, res) => {
  const input = parseLocationInput(req.body);
  if (typeof input === 'string') {
    res.status(400).send(input);
    return;
  }
  try {
    createScheduleLocation(input);
    res.redirect('/admin/schedule/locations');
  } catch {
    res.status(400).send('Площадка с таким названием уже существует');
  }
});

router.post('/schedule/locations/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!getScheduleLocation(id)) {
    res.status(404).send('Площадка не найдена');
    return;
  }
  const input = parseLocationInput(req.body);
  if (typeof input === 'string') {
    res.status(400).send(input);
    return;
  }
  try {
    updateScheduleLocation(id, input);
    res.redirect('/admin/schedule/locations');
  } catch {
    res.status(400).send('Площадка с таким названием уже существует');
  }
});

function isValidYearMonth(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseScheduleTime(value: unknown): string | null {
  const time = cleanText(value).replace('.', ':');
  if (!time) return null;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Некорректный формат времени');
  return time;
}

function parseLocationInput(body: Record<string, unknown>) {
  const name = cleanText(body.name);
  const address = cleanText(body.address);
  const color = cleanText(body.color);
  if (!name) return 'Укажите название площадки';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return 'Цвет должен быть указан в формате #RRGGBB';
  return {
    name,
    address,
    color: color.toLowerCase(),
    sort_order: parseInt(String(body.sort_order ?? '0'), 10) || 0,
    is_active: body.is_active ? 1 : 0,
  };
}

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

router.post('/videos', requireAdmin, async (req, res) => {
  const { title, youtube_url, sort_order } = req.body;
  const resolvedTitle =
    (typeof title === 'string' && title.trim()) ||
    (await resolveYoutubeTitle(youtube_url, 'Без названия'));
  db.prepare('INSERT INTO videos (title, youtube_url, sort_order) VALUES (?, ?, ?)').run(
    resolvedTitle,
    youtube_url,
    parseInt(sort_order, 10) || 0
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
  const sections = getVizitkaSections();
  const coaches = getVizitkaCoaches();
  const intro = sections.find((s) => s.sort_order === 1) ?? sections[0] ?? null;
  const arena = sections.find((s) => s.sort_order === 2) ?? null;
  res.render('admin/vizitka', { title: 'Визитка', intro, arena, coaches });
});

router.post('/vizitka/intro/:id', requireAdmin, (req, res) => {
  const { title, body } = req.body;
  db.prepare('UPDATE vizitka_sections SET title=?, body=? WHERE id=?').run(title, body, req.params.id);
  res.redirect('/admin/vizitka');
});

router.post('/vizitka/arena/:id', requireAdmin, uploadVizitkaImage.single('image'), (req, res) => {
  const existing = db.prepare('SELECT image FROM vizitka_sections WHERE id = ?').get(req.params.id) as
    | { image: string | null }
    | undefined;
  if (!existing) {
    res.status(404).send('Not found');
    return;
  }
  const { body } = req.body;
  let image = existing.image;
  if (req.body.remove_image === '1') {
    image = null;
  } else if (req.file) {
    image = `/uploads/vizitka/${req.file.filename}`;
  }
  db.prepare('UPDATE vizitka_sections SET body=?, image=? WHERE id=?').run(body, image, req.params.id);
  res.redirect('/admin/vizitka');
});

router.post('/vizitka/coach/:id', requireAdmin, uploadVizitkaCoachPhoto.single('photo'), (req, res) => {
  const existing = db.prepare('SELECT photo FROM vizitka_coaches WHERE id = ?').get(req.params.id) as
    | { photo: string }
    | undefined;
  if (!existing) {
    res.status(404).send('Not found');
    return;
  }
  const { role, name, bio } = req.body;
  let photo = existing.photo;
  if (req.body.remove_photo === '1') {
    photo = '';
  } else if (req.file) {
    photo = `/uploads/vizitka/coaches/${req.file.filename}`;
  }
  db.prepare('UPDATE vizitka_coaches SET role=?, name=?, bio=?, photo=? WHERE id=?').run(
    role,
    name,
    bio,
    photo,
    req.params.id
  );
  res.redirect('/admin/vizitka');
});

export default router;
