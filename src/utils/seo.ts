/**
 * Default meta descriptions for public sections (≤160 chars when used).
 */
export const PAGE_DESCRIPTIONS = {
  home: 'Футбольный клуб «Фортуна» Минск — набор мальчиков, расписание тренировок, новости и воспитанники.',
  nabor: 'Круглогодичный набор в футбольный клуб «Фортуна» Минск. Запись на тренировки для мальчиков.',
  blog: 'Новости футбольного клуба «Фортуна» Минск — матчи, тренировки, набор и жизнь клуба.',
  vizitka: 'Визитка ФК «Фортуна» Минск: о клубе, тренерах, арене и контактах.',
  gruppy: 'Группы подготовки футбольного клуба «Фортуна» Минск по годам рождения.',
  raspisanie: 'Расписание тренировок футбольного клуба «Фортуна» Минск.',
  vospitanniki: 'Воспитанники футбольного клуба «Фортуна» Минск.',
  tv: 'FORTUNA TV — видео матчей и тренировок футбольного клуба «Фортуна» Минск.',
  foto: 'Фотогалерея футбольного клуба «Фортуна» Минск.',
} as const;

const SOCIAL_PROFILES = [
  'https://www.instagram.com/fc_fortuna_minsk/',
  'https://vk.com/fcfortuna_by',
  'https://www.youtube.com/@fortunatvbelarus8681',
];

export function truncateMeta(text: string, maxLen = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

export function absoluteUrl(siteUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl.replace(/^http:\/\//i, 'https://');
  const base = siteUrl.replace(/\/$/, '');
  return `${base}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export function sportsTeamJsonLd(siteUrl: string) {
  const url = siteUrl.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: 'ФК «Фортуна» Минск',
    alternateName: 'FC Fortuna Minsk',
    url,
    logo: absoluteUrl(siteUrl, '/images/logo-1.png'),
    image: absoluteUrl(siteUrl, '/images/og-share.jpg'),
    sport: 'Soccer',
    telephone: ['+375296611931', '+375293409823'],
    email: 'fcfortuna@mail.ru',
    sameAs: SOCIAL_PROFILES,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Минск',
      addressCountry: 'BY',
    },
  };
}

export function newsArticleJsonLd(opts: {
  siteUrl: string;
  title: string;
  description: string;
  url: string;
  image?: string | null;
  publishedAt: string;
  modifiedAt?: string | null;
}) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: opts.title,
    description: truncateMeta(opts.description, 200),
    mainEntityOfPage: absoluteUrl(opts.siteUrl, opts.url),
    datePublished: opts.publishedAt,
    dateModified: opts.modifiedAt || opts.publishedAt,
    author: {
      '@type': 'Organization',
      name: 'ФК «Фортуна» Минск',
    },
    publisher: {
      '@type': 'Organization',
      name: 'ФК «Фортуна» Минск',
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl(opts.siteUrl, '/images/logo-1.png'),
      },
    },
  };
  if (opts.image) {
    data.image = [absoluteUrl(opts.siteUrl, opts.image)];
  }
  return data;
}

export function breadcrumbJsonLd(siteUrl: string, items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(siteUrl, item.path),
    })),
  };
}
