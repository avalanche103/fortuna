import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import slugify from 'slugify';
import db from '../db';
import { queryRow, queryRows } from '../db/helpers';
import { UPLOAD_DIR, ensureDataDirs } from '../paths';
import { requireAdmin, verifyAdmin, getAdminId } from '../middleware/auth';
import {
  copyScheduleMonth,
  createScheduleLocation,
  createScheduleMonth,
  deleteScheduleLocation,
  getGroups,
  getRosterGroups,
  getScheduleEntries,
  getScheduleLocation,
  getScheduleLocations,
  getCurrentScheduleMonth,
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
import { createDiplomaPdf } from '../services/diploma';
import { resolveYoutubeTitle } from '../utils/youtube';
import { applyNewsCover, cleanExcerptText, getNewsCoverImage, stripNewsCoverFromBody } from '../utils/news-text';
import { sanitizeNewsHtml } from '../utils/html';
import { imageFileFilter } from '../utils/uploads';
import { pingIndexNow } from '../utils/indexnow';
import { loginRateLimit, clearLoginAttempts } from '../middleware/rate-limit';
import {
  credentialsEmail,
  formatGaDuration,
  formatGaNumber,
  formatGaPercent,
  getGaReport,
  getGaTodayStats,
  getStoredPropertyId,
  isGaConfigured,
  parsePeriod,
  savePropertyId,
  GA_MEASUREMENT_ID,
} from '../services/ga';

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
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFileFilter });

function optionalPhotoUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('photo')(req, res, (err: unknown) => {
    if (err) console.error('player photo upload:', err);
    next();
  });
}

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
const uploadGroupPhoto = multer({ storage: groupStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFileFilter });

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
const uploadVizitkaImage = multer({ storage: vizitkaStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFileFilter });
const uploadVizitkaCoachPhoto = multer({
  storage: vizitkaCoachStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFileFilter,
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
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const router = Router();

router.get('/login', (req: Request, res: Response) => {
  if (req.session.adminId) {
    res.redirect('/admin');
    return;
  }
  res.render('admin/login', { title: 'Вход', error: null });
});

router.post('/login', loginRateLimit, (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!verifyAdmin(username, password)) {
    res.render('admin/login', { title: 'Вход', error: 'Неверный логин или пароль' });
    return;
  }
  const adminId = getAdminId(username);
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).render('pages/500', { title: 'Ошибка сервера', robots: 'noindex, follow' });
      return;
    }
    req.session.adminId = adminId;
    clearLoginAttempts(req);
    res.redirect('/admin');
  });
});

router.post('/logout', requireAdmin, (req: Request, res: Response) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/', requireAdmin, async (_req: Request, res: Response) => {
  const stats = {
    news: (db.prepare('SELECT COUNT(*) as c FROM news').get() as { c: number }).c,
    players: (db.prepare('SELECT COUNT(*) as c FROM players WHERE is_graduate = 0').get() as { c: number }).c,
    graduates: (db.prepare('SELECT COUNT(*) as c FROM players WHERE is_graduate = 1').get() as { c: number }).c,
    groups: (db.prepare('SELECT COUNT(*) as c FROM groups').get() as { c: number }).c,
    schedule: (db.prepare('SELECT COUNT(*) as c FROM schedule_months').get() as { c: number }).c,
    videos: (db.prepare('SELECT COUNT(*) as c FROM videos').get() as { c: number }).c,
  };
  const analytics = await getGaTodayStats();
  res.render('admin/dashboard', { title: 'Панель', stats, analytics, formatGaNumber });
});

router.get('/analytics', requireAdmin, async (req, res) => {
  const period = parsePeriod(req.query.period);
  const report = await getGaReport(period);
  res.render('admin/analytics', {
    title: 'Аналитика',
    report,
    period,
    saved: req.query.saved === '1',
    connectError: typeof req.query.error === 'string' ? req.query.error : '',
    measurementId: GA_MEASUREMENT_ID,
    propertyId: getStoredPropertyId(),
    credentialsEmail: credentialsEmail(),
    configured: isGaConfigured(),
    formatGaNumber,
    formatGaPercent,
    formatGaDuration,
  });
});

router.post('/analytics/connect', requireAdmin, (req, res) => {
  try {
    const propertyId = String(req.body.property_id || '').trim();
    if (propertyId) savePropertyId(propertyId);
    res.redirect('/admin/analytics?saved=1');
  } catch (error) {
    res.redirect(
      '/admin/analytics?error=' + encodeURIComponent(error instanceof Error ? error.message : 'Не удалось сохранить')
    );
  }
});

// --- News ---
router.get('/news', requireAdmin, (req, res) => {
  const news = db
    .prepare(
      `SELECT * FROM news
       ORDER BY CASE WHEN category = 'nabor' THEN 0 ELSE 1 END, sort_order ASC, published_at DESC`
    )
    .all();
  res.render('admin/news-list', {
    title: 'Новости',
    news,
    moved: req.query.moved === '1',
    moveError: req.query.error === 'move',
  });
});

router.post('/news/move', requireAdmin, (req, res) => {
  const id = parseInt(String(req.body.id ?? ''), 10);
  const direction = req.body.direction === 'down' ? 'down' : 'up';
  if (!Number.isFinite(id)) {
    res.redirect('/admin/news?error=move');
    return;
  }

  const current = queryRow<{ id: number; sort_order: number; category: string }>(
    db.prepare('SELECT id, sort_order, category FROM news WHERE id = ?').get(id)
  );
  if (!current || current.category === 'nabor') {
    res.redirect('/admin/news?error=move');
    return;
  }

  const neighbor = queryRow<{ id: number; sort_order: number }>(
    direction === 'up'
      ? db
          .prepare(
            `SELECT id, sort_order FROM news
             WHERE category != 'nabor' AND sort_order < ?
             ORDER BY sort_order DESC LIMIT 1`
          )
          .get(current.sort_order)
      : db
          .prepare(
            `SELECT id, sort_order FROM news
             WHERE category != 'nabor' AND sort_order > ?
             ORDER BY sort_order ASC LIMIT 1`
          )
          .get(current.sort_order)
  );

  if (!neighbor) {
    res.redirect('/admin/news');
    return;
  }

  const update = db.prepare('UPDATE news SET sort_order = ? WHERE id = ?');
  db.exec('BEGIN IMMEDIATE');
  try {
    update.run(neighbor.sort_order, current.id);
    update.run(current.sort_order, neighbor.id);
    db.exec('COMMIT');
    res.redirect('/admin/news?moved=1');
  } catch {
    db.exec('ROLLBACK');
    res.redirect('/admin/news?error=move');
  }
});

router.post('/news/reorder', requireAdmin, (req, res) => {
  const raw = req.body.order;
  const order =
    typeof raw === 'string'
      ? raw
          .split(',')
          .map((value) => parseInt(value.trim(), 10))
          .filter(Number.isFinite)
      : Array.isArray(raw)
        ? raw.map((value) => parseInt(String(value), 10)).filter(Number.isFinite)
        : [];

  if (order.length === 0) {
    res.status(400).json({ error: 'Пустой порядок' });
    return;
  }

  const update = db.prepare('UPDATE news SET sort_order = ? WHERE id = ? AND category != ?');
  db.exec('BEGIN IMMEDIATE');
  try {
    order.forEach((id, index) => update.run(index, id, 'nabor'));
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Не удалось сохранить порядок' });
  }
});

router.get('/news/new', requireAdmin, (_req, res) => {
  res.render('admin/news-form', { title: 'Новая новость', article: null, coverImage: '', bodyHtml: '' });
});

router.get('/news/:id/edit', requireAdmin, (req, res) => {
  const article = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id) as
    | { body: string }
    | undefined;
  if (!article) {
    res.status(404).send('Not found');
    return;
  }
  const coverImage = getNewsCoverImage(article.body) || '';
  const bodyHtml = stripNewsCoverFromBody(article.body, coverImage);
  res.render('admin/news-form', { title: 'Редактировать новость', article, coverImage, bodyHtml });
});

router.post('/news/upload-image', requireAdmin, (req, res) => {
  uploadNewsImage.single('image')(req, res, (err) => {
    if (err) {
      const tooBig =
        (err as { code?: string }).code === 'LIMIT_FILE_SIZE' ||
        /file too large/i.test(err instanceof Error ? err.message : '');
      res.status(400).json({
        error: tooBig
          ? 'Картинка слишком большая. Сохраните JPEG или вставьте ещё раз — теперь она сожмётся сама.'
          : err instanceof Error
            ? err.message
            : 'Ошибка загрузки',
      });
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
  const { title, category, excerpt, body, published_at, is_pinned, cover_image } = req.body;
  const slug = slugify(title, { lower: true, strict: true, locale: 'ru' });
  const newsCategory = category || 'novosti';
  const minSort = queryRow<{ value: number }>(
    db.prepare('SELECT COALESCE(MIN(sort_order), 0) - 1 AS value FROM news WHERE category != ?').get('nabor')
  );
  const sortOrder = newsCategory === 'nabor' ? 0 : (minSort?.value ?? 0);
  const nextBody = sanitizeNewsHtml(applyNewsCover(body, cover_image, title));
  const nextExcerpt = cleanExcerptText(excerpt || '') || null;
  db.prepare(
    `INSERT INTO news (title, slug, category, excerpt, body, is_pinned, sort_order, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(title, slug, newsCategory, nextExcerpt, nextBody, is_pinned ? 1 : 0, sortOrder, published_at);
  void pingIndexNow(String(res.locals.siteUrl || ''), `/blog/${newsCategory}/${slug}`);
  res.redirect('/admin/news');
});

router.post('/news/:id', requireAdmin, (req, res) => {
  const { title, category, excerpt, body, published_at, is_pinned, cover_image } = req.body;
  const nextBody = sanitizeNewsHtml(applyNewsCover(body, cover_image, title));
  const nextExcerpt = cleanExcerptText(excerpt || '') || null;
  const existing = queryRow<{ slug: string }>(db.prepare('SELECT slug FROM news WHERE id = ?').get(req.params.id));
  db.prepare(
    `UPDATE news SET title=?, category=?, excerpt=?, body=?, is_pinned=?, published_at=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(title, category || 'novosti', nextExcerpt, nextBody, is_pinned ? 1 : 0, published_at, req.params.id);
  if (existing?.slug) {
    void pingIndexNow(String(res.locals.siteUrl || ''), `/blog/${category || 'novosti'}/${existing.slug}`);
  }
  res.redirect('/admin/news');
});

router.post('/news/:id/delete', requireAdmin, (req, res) => {
  const article = db.prepare('SELECT category FROM news WHERE id = ?').get(req.params.id) as
    | { category: string }
    | undefined;
  if (article?.category === 'nabor') {
    res.status(400).send('Новость про набор нельзя удалить — только редактировать');
    return;
  }
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
    getCurrentScheduleMonth() ||
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
        const isDouble =
          values.is_double === '1' ||
          values.is_double === 'on' ||
          values.is_double === 'true' ||
          values.is_double === true ||
          values.is_double === 1;
        const timeStart2 = isDouble ? parseScheduleTime(values.time_start_2) : null;
        const timeEnd2 = isDouble ? parseScheduleTime(values.time_end_2) : null;
        if (isDouble) {
          if (!timeStart || !timeEnd) {
            throw new Error(`Для двойного занятия укажите первую смену (${day} число)`);
          }
          if ((timeStart2 && !timeEnd2) || (!timeStart2 && timeEnd2) || !timeStart2 || !timeEnd2) {
            throw new Error(`Для двойного занятия укажите начало и окончание второй смены (${day} число)`);
          }
          if (timeStart2 >= timeEnd2) {
            throw new Error(`Время окончания второй смены должно быть позже начала (${day} число)`);
          }
        }
        const locationId = parseInt(String(values.location_id ?? ''), 10);
        if (Number.isFinite(locationId) && !locationIds.has(locationId)) {
          throw new Error('Выбрана неизвестная площадка');
        }
        const locationId2 = parseInt(String(values.location_id_2 ?? ''), 10);
        if (isDouble && Number.isFinite(locationId2) && !locationIds.has(locationId2)) {
          throw new Error('Выбрана неизвестная площадка для второй смены');
        }
        slots.push({
          day,
          groupId,
          timeStart,
          timeEnd,
          locationId: Number.isFinite(locationId) ? locationId : null,
          isDouble,
          timeStart2,
          timeEnd2,
          locationId2: isDouble && Number.isFinite(locationId2) ? locationId2 : null,
          note: cleanText(values.note) || null,
          note2: isDouble ? (cleanText(values.note_2) || null) : null,
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

router.post('/schedule/locations/:id/delete', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!getScheduleLocation(id)) {
    res.status(404).send('Площадка не найдена');
    return;
  }
  deleteScheduleLocation(id);
  res.redirect('/admin/schedule/locations');
});

function isValidYearMonth(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseScheduleTime(value: unknown): string | null {
  const raw = cleanText(value).replace(',', '.').replace('.', ':');
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) throw new Error('Некорректный формат времени');

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) {
    throw new Error('Некорректный формат времени');
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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

// --- Players & graduates ---
type AdminPlayerRow = {
  id: number;
  name: string;
  birth_date: string | null;
  club: string | null;
  is_graduate: number;
  is_featured: number;
  is_chudo_master: number;
  photo: string | null;
  sort_order: number;
};

function playerListPath(isGraduate: boolean): string {
  return isGraduate ? '/admin/graduates' : '/admin/players';
}

function loadPlayerGroupIds(playerId: number): number[] {
  return queryRows<{ group_id: number }>(
    db.prepare('SELECT group_id FROM group_players WHERE player_id = ?').all(playerId)
  ).map((row) => row.group_id);
}

function nextGraduateSortOrder(): number {
  const minSort = queryRow<{ value: number }>(
    db.prepare(
      'SELECT COALESCE(MIN(sort_order), 0) - 1 AS value FROM players WHERE is_graduate = 1'
    ).get()
  );
  return minSort?.value ?? 0;
}

function uniquePlayerSlug(name: string): string {
  const root = slugify(name || '', { lower: true, strict: true, locale: 'ru' }) || 'player';
  for (let n = 0; n < 1000; n += 1) {
    const slug = n === 0 ? root : `${root}-${n + 1}`;
    const exists = queryRow<{ id: number }>(db.prepare('SELECT id FROM players WHERE slug = ?').get(slug));
    if (!exists) return slug;
  }
  return `${root}-${Date.now()}`;
}

router.get('/players', requireAdmin, (_req, res) => {
  const groups = getGroups();
  const players = queryRows<AdminPlayerRow>(
    db.prepare(
      `SELECT id, name, birth_date, club, is_graduate, is_featured, is_chudo_master, photo, sort_order
       FROM players WHERE is_graduate = 0 ORDER BY name COLLATE NOCASE`
    ).all()
  );
  const memberships = queryRows<{ player_id: number; group_id: number }>(
    db.prepare('SELECT player_id, group_id FROM group_players').all()
  );
  const byId = new Map(players.map((player) => [player.id, player]));
  const byGroup = new Map<number, AdminPlayerRow[]>();
  const groupedIds = new Set<number>();
  for (const row of memberships) {
    const player = byId.get(row.player_id);
    if (!player) continue;
    groupedIds.add(player.id);
    const list = byGroup.get(row.group_id) || [];
    list.push(player);
    byGroup.set(row.group_id, list);
  }
  const grouped = groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      players: (byGroup.get(group.id) || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    }))
    .filter((group) => group.players.length > 0);
  const ungrouped = players.filter((player) => !groupedIds.has(player.id));
  res.render('admin/players-list', {
    title: 'Игроки',
    grouped,
    ungrouped,
    total: players.length,
  });
});

router.get('/graduates', requireAdmin, (req, res) => {
  const graduates = queryRows<AdminPlayerRow>(
    db.prepare(
      `SELECT id, name, birth_date, club, is_graduate, is_featured, is_chudo_master, photo, sort_order
       FROM players WHERE is_graduate = 1 ORDER BY sort_order, name COLLATE NOCASE`
    ).all()
  );
  res.render('admin/graduates-list', {
    title: 'Воспитанники',
    graduates,
    moved: req.query.moved === '1',
    moveError: req.query.error === 'move',
  });
});

router.post('/graduates/move', requireAdmin, (req, res) => {
  const id = parseInt(String(req.body.id ?? ''), 10);
  const direction = req.body.direction === 'down' ? 'down' : 'up';
  if (!Number.isFinite(id)) {
    res.redirect('/admin/graduates?error=move');
    return;
  }

  const graduates = queryRows<{ id: number }>(
    db.prepare(
      'SELECT id FROM players WHERE is_graduate = 1 ORDER BY sort_order, name COLLATE NOCASE'
    ).all()
  );
  const index = graduates.findIndex((row) => row.id === id);
  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || neighborIndex < 0 || neighborIndex >= graduates.length) {
    res.redirect('/admin/graduates');
    return;
  }

  const current = graduates[index];
  graduates[index] = graduates[neighborIndex];
  graduates[neighborIndex] = current;

  const update = db.prepare('UPDATE players SET sort_order = ? WHERE id = ? AND is_graduate = 1');
  db.exec('BEGIN IMMEDIATE');
  try {
    graduates.forEach((row, sortOrder) => update.run(sortOrder, row.id));
    db.exec('COMMIT');
    res.redirect('/admin/graduates?moved=1');
  } catch {
    db.exec('ROLLBACK');
    res.redirect('/admin/graduates?error=move');
  }
});

router.get('/players/new', requireAdmin, (_req, res) => {
  res.render('admin/player-form', {
    title: 'Новый игрок',
    player: null,
    kind: 'player',
    groups: getRosterGroups(),
  });
});

router.get('/graduates/new', requireAdmin, (_req, res) => {
  res.render('admin/player-form', {
    title: 'Новый воспитанник',
    player: null,
    kind: 'graduate',
    groups: [],
  });
});

router.get('/players/:id/edit', requireAdmin, (req, res) => {
  const player = queryRow<AdminPlayerRow>(db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id));
  if (!player) {
    res.status(404).send('Not found');
    return;
  }
  if (player.is_graduate) {
    res.redirect(`/admin/graduates/${player.id}/edit`);
    return;
  }
  res.render('admin/player-form', {
    title: 'Редактировать игрока',
    player: { ...player, groupIds: loadPlayerGroupIds(player.id) },
    kind: 'player',
    groups: getRosterGroups(),
  });
});

router.get('/graduates/:id/edit', requireAdmin, (req, res) => {
  const player = queryRow<AdminPlayerRow>(db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id));
  if (!player) {
    res.status(404).send('Not found');
    return;
  }
  if (!player.is_graduate) {
    res.redirect(`/admin/players/${player.id}/edit`);
    return;
  }
  res.render('admin/player-form', {
    title: 'Редактировать воспитанника',
    player: { ...player, groupIds: loadPlayerGroupIds(player.id) },
    kind: 'graduate',
    groups: [],
  });
});

router.post('/players', requireAdmin, optionalPhotoUpload, (req, res) => {
  const { name, birth_date, position, club, bio, is_graduate, is_featured, is_chudo_master, group_ids } = req.body;
  const isGraduate = Boolean(is_graduate);
  const playerName = String(name || '').trim();
  if (!playerName) {
    res.redirect(isGraduate ? '/admin/graduates/new' : '/admin/players/new');
    return;
  }
  const slug = uniquePlayerSlug(playerName);
  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  const sortOrder = isGraduate ? nextGraduateSortOrder() : 0;
  try {
    const result = db
      .prepare(
        `INSERT INTO players (name, slug, birth_date, position, club, bio, photo, is_graduate, is_featured, is_chudo_master, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        playerName, slug, birth_date || null, position || null, club || null, bio || null, photo,
        isGraduate ? 1 : 0, is_featured ? 1 : 0, is_chudo_master ? 1 : 0, sortOrder
      );
    if (!isGraduate) syncPlayerGroups(Number(result.lastInsertRowid), group_ids);
    res.redirect(playerListPath(isGraduate));
  } catch (err) {
    console.error('create player:', err);
    res.redirect(isGraduate ? '/admin/graduates/new' : '/admin/players/new');
  }
});

router.post('/players/:id', requireAdmin, optionalPhotoUpload, (req, res) => {
  const { name, birth_date, position, club, bio, is_graduate, is_featured, is_chudo_master, group_ids } = req.body;
  const existing = queryRow<{
    photo: string | null;
    position: string | null;
    club: string | null;
    is_featured: number;
    is_chudo_master: number;
  }>(
    db.prepare(
      'SELECT photo, position, club, is_featured, is_chudo_master FROM players WHERE id = ?'
    ).get(req.params.id)
  );
  if (!existing) {
    res.status(404).send('Not found');
    return;
  }
  const isGraduate = Boolean(is_graduate);
  let photo = existing.photo;
  if (req.body.remove_photo === '1') photo = null;
  if (req.file) photo = `/uploads/${req.file.filename}`;
  try {
    db.prepare(
      `UPDATE players SET name=?, birth_date=?, position=?, club=?, bio=?, photo=?, is_graduate=?, is_featured=?, is_chudo_master=?
       WHERE id=?`
    ).run(
      name,
      birth_date || null,
      position || null,
      isGraduate ? club || null : existing.club,
      bio || null,
      photo,
      isGraduate ? 1 : 0,
      isGraduate ? (is_featured ? 1 : 0) : existing.is_featured,
      isGraduate ? existing.is_chudo_master : is_chudo_master ? 1 : 0,
      req.params.id
    );
    if (isGraduate) {
      db.prepare('DELETE FROM group_players WHERE player_id = ?').run(req.params.id);
    } else {
      syncPlayerGroups(parseInt(req.params.id, 10), group_ids);
    }
    res.redirect(playerListPath(isGraduate));
  } catch (err) {
    console.error('update player:', err);
    res.redirect(isGraduate ? `/admin/graduates/${req.params.id}/edit` : `/admin/players/${req.params.id}/edit`);
  }
});

router.post('/players/:id/delete', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    res.status(404).send('Not found');
    return;
  }
  const existing = queryRow<{ is_graduate: number }>(
    db.prepare('SELECT is_graduate FROM players WHERE id = ?').get(id)
  );
  db.prepare('DELETE FROM group_players WHERE player_id = ?').run(id);
  db.prepare('DELETE FROM players WHERE id = ?').run(id);
  res.redirect(playerListPath(Boolean(existing?.is_graduate)));
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
router.get('/videos', requireAdmin, (req, res) => {
  const videos = db.prepare('SELECT * FROM videos ORDER BY sort_order, published_at DESC, id').all();
  res.render('admin/videos-list', {
    title: 'Видео',
    videos,
    moved: req.query.moved === '1',
    moveError: req.query.error === 'move',
  });
});

router.post('/videos/move', requireAdmin, (req, res) => {
  const id = parseInt(String(req.body.id ?? ''), 10);
  const direction = req.body.direction === 'down' ? 'down' : 'up';
  if (!Number.isFinite(id)) {
    res.redirect('/admin/videos?error=move');
    return;
  }

  const videos = queryRows<{ id: number }>(
    db.prepare('SELECT id FROM videos ORDER BY sort_order, published_at DESC, id').all()
  );
  const index = videos.findIndex((video) => video.id === id);
  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || neighborIndex < 0 || neighborIndex >= videos.length) {
    res.redirect('/admin/videos');
    return;
  }

  const current = videos[index];
  videos[index] = videos[neighborIndex];
  videos[neighborIndex] = current;

  const update = db.prepare('UPDATE videos SET sort_order = ? WHERE id = ?');
  db.exec('BEGIN IMMEDIATE');
  try {
    videos.forEach((video, sortOrder) => update.run(sortOrder, video.id));
    db.exec('COMMIT');
    res.redirect('/admin/videos?moved=1');
  } catch {
    db.exec('ROLLBACK');
    res.redirect('/admin/videos?error=move');
  }
});

router.post('/videos', requireAdmin, async (req, res) => {
  const { title, youtube_url } = req.body;
  const resolvedTitle =
    (typeof title === 'string' && title.trim()) ||
    (await resolveYoutubeTitle(youtube_url, 'Без названия'));
  const minSort = queryRow<{ value: number }>(
    db.prepare("SELECT COALESCE(MIN(sort_order), 0) - 1 AS value FROM videos").get()
  );
  db.prepare('INSERT INTO videos (title, youtube_url, sort_order) VALUES (?, ?, ?)').run(
    resolvedTitle,
    youtube_url,
    minSort?.value ?? 0
  );
  res.redirect('/admin/videos');
});

router.post('/videos/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
  res.redirect('/admin/videos');
});

// --- Diplomas ---
router.get('/diplomas', requireAdmin, (_req, res) => {
  res.render('admin/diplomas', { title: 'Дипломы' });
});

router.post('/diplomas/generate', requireAdmin, async (req, res) => {
  const recipientName = cleanText(req.body.recipient_name);
  const birthYear = parseInt(String(req.body.birth_year ?? ''), 10);
  const educationUntilAge = parseInt(String(req.body.education_until_age ?? ''), 10);
  const city = cleanText(req.body.city);
  const mentors = cleanText(req.body.mentors);
  const directorName = cleanText(req.body.director_name);
  const issueDate = cleanText(req.body.issue_date);
  const currentYear = new Date().getFullYear();

  if (!recipientName || recipientName.length > 120) {
    res.status(400).send('Укажите ФИО получателя');
    return;
  }
  if (!Number.isInteger(birthYear) || birthYear < 1990 || birthYear > currentYear) {
    res.status(400).send('Укажите корректный год рождения');
    return;
  }
  if (!Number.isInteger(educationUntilAge) || educationUntilAge < 4 || educationUntilAge > 21) {
    res.status(400).send('Укажите корректный возраст окончания обучения');
    return;
  }
  if (!city || city.length > 80 || !mentors || mentors.length > 180) {
    res.status(400).send('Заполните город и наставников');
    return;
  }
  if (!directorName || directorName.length > 100) {
    res.status(400).send('Укажите директора');
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || Number.isNaN(Date.parse(issueDate))) {
    res.status(400).send('Укажите корректную дату выдачи');
    return;
  }

  try {
    const pdf = await createDiplomaPdf({
      recipientName,
      birthYear,
      educationUntilAge,
      city,
      mentors,
      directorName,
      issueDate,
    });
    const safeName = slugify(recipientName, { lower: true, strict: true }) || 'poluchatel';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="svidetelstvo-${safeName}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.send(pdf);
  } catch (error) {
    console.error('Diploma PDF generation failed:', error);
    res.status(500).send('Не удалось сгенерировать PDF');
  }
});

// --- Settings ---
router.get('/settings', requireAdmin, (_req, res) => {
  res.render('admin/settings', { title: 'Настройки сайта', settings: getSettings() });
});

router.post('/settings', requireAdmin, (req, res) => {
  const upsert = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const skip = new Set(['_csrf']);
  for (const [key, value] of Object.entries(req.body)) {
    if (skip.has(key) || typeof value !== 'string') continue;
    if (key === 'ym_counter_id') {
      upsert.run(key, value.replace(/\D/g, '').slice(0, 20));
      continue;
    }
    upsert.run(key, value);
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

router.post('/vizitka/coach', requireAdmin, uploadVizitkaCoachPhoto.single('photo'), (req, res) => {
  const name = cleanText(req.body.name);
  if (!name) {
    res.status(400).send('Укажите имя тренера');
    return;
  }
  const role = cleanText(req.body.role);
  const bio = cleanText(req.body.bio);
  const photo = req.file ? `/uploads/vizitka/coaches/${req.file.filename}` : '';
  const maxSort = queryRow<{ value: number }>(
    db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM vizitka_coaches').get()
  );
  db.prepare('INSERT INTO vizitka_coaches (photo, role, name, bio, sort_order) VALUES (?, ?, ?, ?, ?)').run(
    photo,
    role,
    name,
    bio,
    (maxSort?.value ?? 0) + 1
  );
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

router.post('/vizitka/coach/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM vizitka_coaches WHERE id = ?').run(req.params.id);
  res.redirect('/admin/vizitka');
});

export default router;
