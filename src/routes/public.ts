import { Router, Request, Response } from 'express';
import {
  getAllGraduates,
  getGruppyGroupPlayers,
  getGruppyGroups,
  getGruppyPlayersByGroup,
  getArchiveItems,
  getArchiveYear,
  getArchiveYears,
  getBirthdaysThisMonth,
  getCurrentScheduleMonth,
  getFeaturedGraduates,
  getGroupBySlug,
  getScheduleGroups,
  getGraduateBySlug,
  getLatestNews,
  getNewsBySlug,
  getNewsList,
  getScheduleEntries,
  getSettings,
  getVideos,
  getVizitkaSections,
  getVizitkaCoaches,
  MONTH_NAMES,
  formatDateRu,
  getNewsExcerpt,
  getNewsCoverImage,
  youtubeEmbedUrl,
  youtubeThumb,
} from '../services/content';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const settings = getSettings();
  const birthdays = getBirthdaysThisMonth();
  const monthName = MONTH_NAMES[new Date().getMonth()];

  res.render('pages/home', {
    title: 'Футбольный клуб Фортуна',
    news: getLatestNews(8),
    birthdays,
    monthName,
    videos: getVideos(),
    graduates: getFeaturedGraduates(12),
    settings,
    formatDateRu,
    getNewsExcerpt,
    getNewsCoverImage,
    youtubeThumb,
  });
});

router.get('/blog', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const { items, pages } = getNewsList(page);

  res.render('pages/blog', {
    title: 'Новости',
    news: items,
    page,
    pages,
    formatDateRu,
    getNewsExcerpt,
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

router.get('/raspisanie', (_req: Request, res: Response) => {
  const month = getCurrentScheduleMonth();
  const groups = getScheduleGroups();
  const entries = month ? getScheduleEntries(month.id) : [];

  res.render('pages/raspisanie', {
    title: 'Расписание',
    month,
    monthName: month ? MONTH_NAMES[month.month - 1] : MONTH_NAMES[new Date().getMonth()],
    groups,
    entries,
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

router.get('/arhiv', (_req: Request, res: Response) => {
  res.render('pages/arhiv', {
    title: 'Архив',
    archiveYears: getArchiveYears('archive'),
    galleryYears: getArchiveYears('gallery'),
  });
});

router.get('/arhiv/fotogalereya', (_req: Request, res: Response) => {
  res.render('pages/fotogalereya', {
    title: 'Фотогалерея',
    years: getArchiveYears('gallery'),
    inArchive: true,
  });
});

router.get('/arhiv/fotogalereya/:year', (req: Request, res: Response) => {
  const year = parseInt(req.params.year, 10);
  const archiveYear = getArchiveYear(year, 'gallery');
  if (!archiveYear) {
    res.status(404).render('pages/404', { title: 'Страница не найдена' });
    return;
  }

  res.render('pages/fotogalereya-year', {
    title: `Фотогалерея ${year}`,
    year,
    items: getArchiveItems(archiveYear.id),
    inArchive: true,
  });
});

router.get('/arhiv/:year', (req: Request, res: Response) => {
  const year = parseInt(req.params.year, 10);
  const archiveYear = getArchiveYear(year, 'archive');
  if (!archiveYear) {
    res.status(404).render('pages/404', { title: 'Страница не найдена' });
    return;
  }

  res.render('pages/arhiv-year', {
    title: `Архив ${year}`,
    year,
    items: getArchiveItems(archiveYear.id),
  });
});

// Редиректы со старых путей фотогалереи
router.get('/fotogalereya', (_req: Request, res: Response) => {
  res.redirect(301, '/arhiv/fotogalereya');
});

router.get('/fotogalereya/:year', (req: Request, res: Response) => {
  res.redirect(301, `/arhiv/fotogalereya/${req.params.year}`);
});

export default router;
