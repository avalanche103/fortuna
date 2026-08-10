import db from '../db';
import { queryRows } from '../db/helpers';
import { getArchiveItems, getArchiveYears, getGruppyGroups } from './content';

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: string;
};

function isoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

/** Public URLs for sitemap.xml (paths only, no host). */
export function getSitemapEntries(): SitemapEntry[] {
  const entries: SitemapEntry[] = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/nabor', changefreq: 'monthly', priority: '0.9' },
    { loc: '/blog', changefreq: 'daily', priority: '0.9' },
    { loc: '/vizitka', changefreq: 'monthly', priority: '0.8' },
    { loc: '/gruppy', changefreq: 'weekly', priority: '0.8' },
    { loc: '/raspisanie', changefreq: 'weekly', priority: '0.8' },
    { loc: '/vospitanniki', changefreq: 'weekly', priority: '0.7' },
    { loc: '/tv', changefreq: 'weekly', priority: '0.7' },
    { loc: '/foto', changefreq: 'weekly', priority: '0.7' },
  ];

  const news = queryRows<{ slug: string; category: string; published_at: string; updated_at?: string }>(
    db
      .prepare(
        `SELECT slug, category, published_at,
                COALESCE(updated_at, published_at) AS updated_at
         FROM news
         ORDER BY published_at DESC`
      )
      .all()
  );

  for (const item of news) {
    const category = item.category || 'novosti';
    entries.push({
      loc: `/blog/${category}/${item.slug}`,
      lastmod: isoDate(item.updated_at || item.published_at),
      changefreq: 'monthly',
      priority: '0.7',
    });
  }

  for (const group of getGruppyGroups()) {
    entries.push({
      loc: `/gruppy/${group.slug}`,
      changefreq: 'weekly',
      priority: '0.6',
    });
  }

  const graduates = queryRows<{ slug: string }>(
    db.prepare('SELECT slug FROM players WHERE is_graduate = 1 ORDER BY sort_order ASC, name ASC').all()
  );
  for (const graduate of graduates) {
    entries.push({
      loc: `/vospitanniki/${graduate.slug}`,
      changefreq: 'monthly',
      priority: '0.5',
    });
  }

  const players = queryRows<{ slug: string }>(
    db.prepare('SELECT slug FROM players WHERE is_graduate = 0 ORDER BY sort_order ASC, name ASC').all()
  );
  for (const player of players) {
    entries.push({
      loc: `/player/${player.slug}`,
      changefreq: 'monthly',
      priority: '0.5',
    });
  }

  for (const year of getArchiveYears('gallery')) {
    entries.push({
      loc: `/foto/${year.year}`,
      changefreq: 'monthly',
      priority: '0.5',
    });
    for (const album of getArchiveItems(year.id)) {
      entries.push({
        loc: `/foto/${year.year}/${album.slug}`,
        changefreq: 'monthly',
        priority: '0.4',
      });
    }
  }

  return entries;
}

export function renderSitemapXml(siteUrl: string, entries: SitemapEntry[]): string {
  const base = siteUrl.replace(/\/$/, '');
  const body = entries
    .map((entry) => {
      const lines = [`    <loc>${escapeXml(`${base}${entry.loc}`)}</loc>`];
      if (entry.lastmod) lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      if (entry.changefreq) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority) lines.push(`    <priority>${entry.priority}</priority>`);
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
