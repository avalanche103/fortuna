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
  getGroupBySlug,
  getScheduleGroups,
  getGraduateBySlug,
  getPlayerBySlug,
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
  youtubeThumb,
} from '../services/content';
import { getSitemapEntries, renderSitemapXml } from '../services/sitemap';
import {
  PAGE_DESCRIPTIONS,
  newsArticleJsonLd,
  sportsTeamJsonLd,
  truncateMeta,
} from '../utils/seo';

const router = Router();

router.get('/robots.txt', (_req: Request, res: Response) => {
  const base = res.locals.siteUrl as string;
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /admin/',
      'Disallow: /api/',
      '',
      `Sitemap: ${base}/sitemap.xml`,
      '',
    ].join('\n')
  );
});

router.get('/sitemap.xml', (_req: Request, res: Response) => {
  const xml = renderSitemapXml(res.locals.siteUrl as string, getSitemapEntries());
  res.type('application/xml').send(xml);
});

router.get('/', (_req: Request, res: Response) => {
  const settings = getSettings();
  const birthdays = getBirthdaysThisMonth(5);
  const recruitmentNews = getLatestNewsByCategory('nabor');
  const siteUrl = res.locals.siteUrl as string;

  res.render('pages/home', {
    title: 'Футбольный клуб Фортуна',
    description: PAGE_DESCRIPTIONS.home,
    ogUrl: '/',
    ogImage: '/images/og-share.jpg',
    jsonLd: sportsTeamJsonLd(siteUrl),
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
    description: truncateMeta(
      [recruitment.title, recruitment.subtitle, recruitment.teaser].filter(Boolean).join('. ') ||
        PAGE_DESCRIPTIONS.nabor
    ),
    ogUrl: '/nabor',
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

  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  const ogUrl = query ? `/blog?${query}` : '/blog';

  const olderPage = year ? page - 1 : page + 1;
  const newerPage = year ? page + 1 : page - 1;
  const canGoOlder = year ? page > 1 : page < pages;
  const canGoNewer = year ? page < pages : page > 1;

  function blogHref(targetPage: number, targetYear: number | null) {
    const p = new URLSearchParams();
    if (targetYear) p.set('year', String(targetYear));
    if (targetPage > 1) p.set('page', String(targetPage));
    const q = p.toString();
    return q ? `/blog?${q}` : '/blog';
  }

  res.render('pages/blog', {
    title: year ? `Новости · ${year}` : 'Новости',
    description: year
      ? truncateMeta(`Новости ФК «Фортуна» Минск за ${year} год.`)
      : PAGE_DESCRIPTIONS.blog,
    ogUrl,
    prevUrl: canGoNewer ? blogHref(newerPage, year) : null,
    nextUrl: canGoOlder ? blogHref(olderPage, year) : null,
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

function renderNewsDetail(_req: Request, res: Response, article: NonNullable<ReturnType<typeof getNewsBySlug>>) {
  const coverImage = getNewsCoverImage(article);
  const excerpt = getNewsExcerpt(article, 160);
  const category = article.category || 'novosti';
  const ogUrl = `/blog/${category}/${article.slug}`;
  const siteUrl = res.locals.siteUrl as string;

  res.render('pages/news-detail', {
    title: article.title,
    description: truncateMeta(excerpt || article.title),
    ogUrl,
    ogImage: coverImage || '/images/og-share.jpg',
    ogType: 'article',
    articlePublishedAt: article.published_at,
    jsonLd: newsArticleJsonLd({
      siteUrl,
      title: article.title,
      description: excerpt || article.title,
      url: ogUrl,
      image: coverImage,
      publishedAt: article.published_at,
    }),
    article,
    coverImage,
    bodyHtml: getNewsArticleBody(article),
    formatDateRu,
  });
}

router.get('/blog/:category/:slug', (req: Request, res: Response) => {
  const article = getNewsBySlug(req.params.slug);
  if (!article) {
    res.status(404).render('pages/404', { title: 'Страница не найдена', robots: 'noindex, follow' });
    return;
  }

  const canonicalCategory = article.category || 'novosti';
  if (req.params.category !== canonicalCategory) {
    res.redirect(301, `/blog/${canonicalCategory}/${article.slug}`);
    return;
  }

  renderNewsDetail(req, res, article);
});

router.get('/blog/:slug', (req: Request, res: Response) => {
  const article = getNewsBySlug(req.params.slug);
  if (!article) {
    res.status(404).render('pages/404', { title: 'Страница не найдена', robots: 'noindex, follow' });
    return;
  }

  const category = article.category || 'novosti';
  res.redirect(301, `/blog/${category}/${article.slug}`);
});

router.get('/vizitka', (_req: Request, res: Response) => {
  res.render('pages/vizitka', {
    title: 'Визитка',
    description: PAGE_DESCRIPTIONS.vizitka,
    ogUrl: '/vizitka',
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
    description: PAGE_DESCRIPTIONS.gruppy,
    ogUrl: '/gruppy',
    groups,
    playersByGroup,
  });
});

router.get('/gruppy/:slug', (req: Request, res: Response) => {
  const group = getGroupBySlug(req.params.slug);
  if (!group) {
    res.status(404).render('pages/404', { title: 'Страница не найдена', robots: 'noindex, follow' });
    return;
  }

  res.render('pages/gruppy-detail', {
    title: group.name,
    description: truncateMeta(
      `Группа ${group.name}${group.birth_years ? ` (${group.birth_years})` : ''} — ФК «Фортуна» Минск.`
    ),
    ogUrl: `/gruppy/${group.slug}`,
    ogImage: group.photo || '/images/og-share.jpg',
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

  const monthLabel = `${MONTH_NAMES[displayMonth - 1]} ${displayYear}`;
  res.render('pages/raspisanie', {
    title: 'Расписание',
    description: truncateMeta(
      selectedGroup
        ? `Расписание группы ${selectedGroup.name} — ${monthLabel}, ФК «Фортуна» Минск.`
        : `Расписание тренировок на ${monthLabel} — ФК «Фортуна» Минск.`
    ),
    ogUrl: '/raspisanie',
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
    description: PAGE_DESCRIPTIONS.vospitanniki,
    ogUrl: '/vospitanniki',
    graduates: getAllGraduates(),
  });
});

router.get('/vospitanniki/:slug', (req: Request, res: Response) => {
  const graduate = getGraduateBySlug(req.params.slug);
  if (!graduate) {
    res.status(404).render('pages/404', { title: 'Страница не найдена', robots: 'noindex, follow' });
    return;
  }

  res.render('pages/vospitannik-detail', {
    title: graduate.name,
    description: truncateMeta(`Воспитанник ${graduate.name} — ФК «Фортуна» Минск.`),
    ogUrl: `/vospitanniki/${graduate.slug}`,
    ogImage: graduate.photo || '/images/og-share.jpg',
    graduate,
  });
});

router.get('/player/:slug', (req: Request, res: Response) => {
  const player = getPlayerBySlug(req.params.slug);
  if (!player) {
    res.status(404).render('pages/404', { title: 'Страница не найдена', robots: 'noindex, follow' });
    return;
  }

  res.render('pages/player-detail', {
    title: player.name,
    description: truncateMeta(`Игрок ${player.name} — ФК «Фортуна» Минск.`),
    ogUrl: `/player/${player.slug}`,
    ogImage: player.photo || '/images/og-share.jpg',
    player,
    formatDateRu,
  });
});

router.get('/tv', (_req: Request, res: Response) => {
  res.render('pages/tv', {
    title: 'FORTUNA TV',
    description: PAGE_DESCRIPTIONS.tv,
    ogUrl: '/tv',
    videos: getVideos(),
    youtubeThumb,
  });
});

router.get('/foto', (_req: Request, res: Response) => {
  res.render('pages/foto', {
    title: 'Фото',
    description: PAGE_DESCRIPTIONS.foto,
    ogUrl: '/foto',
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
    res.status(404).render('pages/404', { title: 'Страница не найдена', robots: 'noindex, follow' });
    return;
  }

  res.render('pages/foto-year', {
    title: `Фото · ${year}`,
    description: truncateMeta(`Фотогалерея ${year} года — ФК «Фортуна» Минск.`),
    ogUrl: `/foto/${year}`,
    year,
    items: getArchiveItems(archiveYear.id),
  });
});

router.get('/foto/:year/:slug', (req: Request, res: Response) => {
  const year = parseInt(req.params.year, 10);
  const archiveYear = getArchiveYear(year, 'gallery');
  if (!archiveYear) {
    res.status(404).render('pages/404', { title: 'Страница не найдена', robots: 'noindex, follow' });
    return;
  }

  const album = getArchiveItem(archiveYear.id, req.params.slug);
  if (!album) {
    res.status(404).render('pages/404', { title: 'Страница не найдена', robots: 'noindex, follow' });
    return;
  }

  res.render('pages/foto-album', {
    title: album.title,
    description: truncateMeta(`${album.title} — фотогалерея ФК «Фортуна» Минск.`),
    ogUrl: `/foto/${year}/${album.slug}`,
    ogImage: album.cover_image || '/images/og-share.jpg',
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
