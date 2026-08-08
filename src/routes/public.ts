import { Router, Request, Response } from 'express';
import {
  getAllGraduates,
  getGruppyGroupPlayers,
  getGruppyGroups,
  getGruppyPlayersByGroup,
  getArchiveItems,
  getArchiveItem,
  getArchivePhotos,
  getGalleryPhotoNav,
  getArchiveYear,
  getArchiveYears,
  getBirthdaysThisMonth,
  getCurrentScheduleMonth,
  getFeaturedGraduates,
  getGroupBySlug,
  getScheduleGroups,
  getGraduateBySlug,
  getPlayerBySlug,
  getLatestNews,
  getLatestNewsByCategory,
  getLatestNewsExcludingCategory,
  getNewsBySlug,
  getNewsList,
  getNewsYears,
  getScheduleEntries,
  getScheduleLocations,
  getScheduleMonth,
  getScheduleMonths,
  getSettings,
  getRecruitmentContent,
  getVideos,
  getVizitkaSections,
  getVizitkaCoaches,
  MONTH_NAMES,
  formatDateRu,
  getNewsExcerpt,
  getNewsCoverImage,
  getNewsArticleBody,
  youtubeEmbedUrl,
  youtubeThumb,
} from '../services/content';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const settings = getSettings();
  const birthdays = getBirthdaysThisMonth(5);
  const recruitmentNews = getLatestNewsByCategory('nabor');

  res.render('pages/home', {
    title: 'Футбольный клуб Фортуна',
    recruitmentNews,
    news: getLatestNewsExcludingCategory(8, 'nabor'),
    todayDate: formatDateRu(new Date().toISOString()),
    birthdays,
    videos: getVideos(),
    graduates: getAllGraduates(),
    settings,
    recruitment: getRecruitmentContent(settings),
    formatDateRu,
    getNewsExcerpt,
    getNewsCoverImage,
    youtubeThumb,
  });
});

router.get('/nabor', (_req: Request, res: Response) => {
  const settings = getSettings();
  const recruitment = getRecruitmentContent(settings);
  res.render('pages/nabor', {
    title: 'Набор',
    settings,
    recruitment,
  });
});

router.get('/blog', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const yearRaw = parseInt(String(req.query.year ?? ''), 10);
  const year = Number.isFinite(yearRaw) && yearRaw > 1900 ? yearRaw : null;
  const { items, pages } = getNewsList(page, 18, year);
  const years = getNewsYears();

  res.render('pages/blog', {
    title: year ? `Новости · ${year}` : 'Новости',
    news: items,
    page,
    pages,
    year,
    years,
    formatDateRu,
    getNewsExcerpt,
    getNewsCoverImage,
  });
});

router.get('/blog/:category/:slug', (req: Request, res: Response) => {
  const article = getNewsBySlug(req.params.slug);
  if (!article) {
    res.status(404).render('pages/404', { title: 'Страница не найдена' });
    return;
  }

  res.render('pages/news-detail', {
    title: article.title,
    article,
    coverImage: getNewsCoverImage(article),
    bodyHtml: getNewsArticleBody(article),
    formatDateRu,
  });
});

router.get('/blog/:slug', (req: Request, res: Response) => {
  const article = getNewsBySlug(req.params.slug);
  if (!article) {
    res.status(404).render('pages/404', { title: 'Страница не найдена' });
    return;
  }

  res.render('pages/news-detail', {
    title: article.title,
    article,
    coverImage: getNewsCoverImage(article),
    bodyHtml: getNewsArticleBody(article),
    formatDateRu,
  });
});

router.get('/vizitka', (_req: Request, res: Response) => {
  res.render('pages/vizitka', {
    title: 'Визитка',
    sections: getVizitkaSections(),
    coaches: getVizitkaCoaches(),
  });
});

router.get('/gruppy', (_req: Request, res: Response) => {
  const groups = getGruppyGroups();
  const playersByGroup: Record<number, ReturnType<typeof getGruppyPlayersByGroup> extends Map<number, infer V> ? V : never> = {};
  for (const [groupId, players] of getGruppyPlayersByGroup()) {
    playersByGroup[groupId] = players;
  }

  res.render('pages/gruppy', {
    title: 'Группы',
    groups,
    playersByGroup,
  });
});

router.get('/gruppy/:slug', (req: Request, res: Response) => {
  const group = getGroupBySlug(req.params.slug);
  if (!group) {
    res.status(404).render('pages/404', { title: 'Страница не найдена' });
    return;
  }

  res.render('pages/gruppy-detail', {
    title: group.name,
    group,
    players: getGruppyGroupPlayers(group),
  });
});

function isPastScheduleMonth(year: number, month: number, now: Date): boolean {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return year < currentYear || (year === currentYear && month < currentMonth);
}

function getFirstVisibleScheduleDay(year: number, month: number, now: Date): number {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year === currentYear && month === currentMonth) return now.getDate();
  return 1;
}

router.get('/raspisanie', (req: Request, res: Response) => {
  const now = new Date();
  const allMonths = getScheduleMonths();
  const months = allMonths
    .filter((item) => !isPastScheduleMonth(item.year, item.month, now))
    .sort((a, b) => a.year - b.year || a.month - b.month);
  const groups = getScheduleGroups();
  const requestedYear = parseInt(String(req.query.year ?? ''), 10);
  const requestedMonth = parseInt(String(req.query.month ?? ''), 10);
  const hasRequestedMonth =
    Number.isInteger(requestedYear) &&
    requestedYear >= 2000 &&
    requestedYear <= 2100 &&
    Number.isInteger(requestedMonth) &&
    requestedMonth >= 1 &&
    requestedMonth <= 12;
  const selectedGroup = groups.find((group) => group.slug === String(req.query.group ?? '')) ?? null;

  if (hasRequestedMonth && isPastScheduleMonth(requestedYear, requestedMonth, now)) {
    const redirectParams = new URLSearchParams();
    if (selectedGroup) redirectParams.set('group', selectedGroup.slug);
    const query = redirectParams.toString();
    res.redirect(query ? `/raspisanie?${query}` : '/raspisanie');
    return;
  }

  const month = hasRequestedMonth
    ? getScheduleMonth(requestedYear, requestedMonth)
    : getCurrentScheduleMonth() ?? months[0];
  const allEntries = month ? getScheduleEntries(month.id) : [];
  const displayYear = month?.year ?? (hasRequestedMonth ? requestedYear : now.getFullYear());
  const displayMonth = month?.month ?? (hasRequestedMonth ? requestedMonth : now.getMonth() + 1);
  const firstVisibleDay = getFirstVisibleScheduleDay(displayYear, displayMonth, now);
  const futureEntries = allEntries.filter((entry) => entry.day >= firstVisibleDay);
  const entries = selectedGroup
    ? futureEntries.filter((entry) => entry.group_id === selectedGroup.id)
    : futureEntries;
  const visibleGroups = selectedGroup ? [selectedGroup] : groups;

  res.render('pages/raspisanie', {
    title: 'Расписание',
    month,
    monthName: MONTH_NAMES[displayMonth - 1],
    displayYear,
    displayMonth,
    months,
    groups: visibleGroups,
    allGroups: groups,
    selectedGroup,
    entries,
    firstVisibleDay,
    daysInMonth: new Date(displayYear, displayMonth, 0).getDate(),
    locations: getScheduleLocations(false),
    scheduleTextColor,
    MONTH_NAMES,
  });
});

router.get('/vospitanniki', (_req: Request, res: Response) => {
  res.render('pages/vospitanniki', {
    title: 'Воспитанники',
    graduates: getAllGraduates(),
  });
});

router.get('/vospitanniki/:slug', (req: Request, res: Response) => {
  const graduate = getGraduateBySlug(req.params.slug);
  if (!graduate) {
    res.status(404).render('pages/404', { title: 'Страница не найдена' });
    return;
  }

  res.render('pages/vospitannik-detail', {
    title: graduate.name,
    graduate,
  });
});

router.get('/player/:slug', (req: Request, res: Response) => {
  const player = getPlayerBySlug(req.params.slug);
  if (!player) {
    res.status(404).render('pages/404', { title: 'Страница не найдена' });
    return;
  }

  res.render('pages/player-detail', {
    title: player.name,
    player,
    formatDateRu,
  });
});

router.get('/tv', (_req: Request, res: Response) => {
  res.render('pages/tv', {
    title: 'FC Fortuna TV',
    videos: getVideos(),
    youtubeThumb,
  });
});

router.get('/foto', (_req: Request, res: Response) => {
  res.render('pages/foto', {
    title: 'Фото',
    years: getArchiveYears('gallery'),
  });
});

router.get('/api/foto/photo/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const nav = getGalleryPhotoNav(id);
  if (!nav) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(nav);
});

router.get('/foto/:year', (req: Request, res: Response) => {
  const year = parseInt(req.params.year, 10);
  const archiveYear = getArchiveYear(year, 'gallery');
  if (!archiveYear) {
    res.status(404).render('pages/404', { title: 'Страница не найдена' });
    return;
  }

  res.render('pages/foto-year', {
    title: `Фото · ${year}`,
    year,
    items: getArchiveItems(archiveYear.id),
  });
});

router.get('/foto/:year/:slug', (req: Request, res: Response) => {
  const year = parseInt(req.params.year, 10);
  const archiveYear = getArchiveYear(year, 'gallery');
  if (!archiveYear) {
    res.status(404).render('pages/404', { title: 'Страница не найдена' });
    return;
  }

  const album = getArchiveItem(archiveYear.id, req.params.slug);
  if (!album) {
    res.status(404).render('pages/404', { title: 'Страница не найдена' });
    return;
  }

  res.render('pages/foto-album', {
    title: album.title,
    year,
    album,
    photos: getArchivePhotos(album.id),
  });
});

// Редиректы со старых путей
router.get('/arhiv', (_req: Request, res: Response) => {
  res.redirect(301, '/foto');
});

router.get('/arhiv/fotogalereya', (_req: Request, res: Response) => {
  res.redirect(301, '/foto');
});

router.get('/arhiv/fotogalereya/:year', (req: Request, res: Response) => {
  res.redirect(301, `/foto/${req.params.year}`);
});

router.get('/arhiv/:year', (req: Request, res: Response) => {
  res.redirect(301, `/foto/${req.params.year}`);
});

router.get('/fotogalereya', (_req: Request, res: Response) => {
  res.redirect(301, '/foto');
});

router.get('/fotogalereya/:year', (req: Request, res: Response) => {
  res.redirect(301, `/foto/${req.params.year}`);
});

router.get('/fotogalereya/:year/:slug', (req: Request, res: Response) => {
  res.redirect(301, `/foto/${req.params.year}/${req.params.slug}`);
});

function scheduleTextColor(color: string | null | undefined): '#102451' | '#ffffff' {
  const match = /^#([0-9a-f]{6})$/i.exec(color ?? '');
  if (!match) return '#ffffff';
  const value = parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 155 ? '#102451' : '#ffffff';
}

export default router;
