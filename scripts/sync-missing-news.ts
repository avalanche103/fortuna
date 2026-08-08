/**
 * Compare old-site blog with local DB; import missing news (skip набор).
 * Usage: npx tsx scripts/sync-missing-news.ts [--dry-run]
 */
import { db } from '../src/db/index.ts';
import { fetchPage, BASE } from '../src/db/importer/utils.ts';
import { parseNewsListPage, parseNewsArticle, type NewsPreview } from '../src/db/importer/parsers.ts';
import { buildNewsExcerpt } from '../src/utils/news-text.ts';

const dryRun = process.argv.includes('--dry-run');

function isNaborPost(item: NewsPreview): boolean {
  if (item.category === 'nabor') return true;
  if (/набор/i.test(item.title)) return true;
  if (/набор/i.test(item.excerpt)) return true;
  if (/\/blog\/nabor\//i.test(item.url)) return true;
  return false;
}

async function fetchAllOldNews(): Promise<NewsPreview[]> {
  const firstHtml = await fetchPage(`${BASE}/blog`);
  const { totalPages, items: first } = parseNewsListPage(firstHtml);
  const all = [...first];
  console.log(`Old site: ${totalPages} pages`);

  for (let page = 2; page <= totalPages; page++) {
    const html = await fetchPage(`${BASE}/blog?page=${page}`);
    const { items } = parseNewsListPage(html);
    all.push(...items);
    if (page % 10 === 0 || page === totalPages) {
      console.log(`  fetched page ${page}/${totalPages} (items so far: ${all.length})`);
    }
  }
  return all;
}

async function main() {
  const local = db
    .prepare('SELECT slug, category, title FROM news')
    .all() as { slug: string; category: string; title: string }[];
  const localSlugs = new Set(local.map((r) => r.slug));
  console.log(`Local news: ${local.length}`);

  const oldItems = await fetchAllOldNews();
  console.log(`Old news items: ${oldItems.length}`);

  const missing = oldItems.filter((item) => !localSlugs.has(item.slug));
  const missingNabor = missing.filter(isNaborPost);
  const toImport = missing.filter((item) => !isNaborPost(item));

  console.log(`Missing total: ${missing.length}`);
  console.log(`Missing набор (skip): ${missingNabor.length}`);
  console.log(`To import: ${toImport.length}`);

  for (const item of missingNabor) {
    console.log(`  SKIP nabor: ${item.publishedAt.slice(0, 10)}  ${item.slug}  ${item.title}`);
  }
  for (const item of toImport) {
    console.log(`  NEED: ${item.publishedAt.slice(0, 10)}  [${item.category}]  ${item.slug}  ${item.title}`);
  }

  if (dryRun || !toImport.length) {
    console.log(dryRun ? 'Dry run — no writes.' : 'Nothing to import.');
    return;
  }

  const minSort = (
    db
      .prepare(`SELECT COALESCE(MIN(sort_order), 0) - 1 AS value FROM news WHERE category != 'nabor'`)
      .get() as { value: number }
  ).value;

  const insert = db.prepare(
    `INSERT INTO news (title, slug, category, excerpt, body, is_pinned, sort_order, published_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, datetime('now'))`,
  );

  let imported = 0;

  // Newest first; lower sort_order appears higher on the site.
  const ordered = [...toImport].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  // Reserve a contiguous block: newest = minSort - (n-1), oldest of batch = minSort
  const baseSort = minSort - (ordered.length - 1);

  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const sortOrder = baseSort + i;
    let body = '';
    try {
      const articleHtml = await fetchPage(item.url, 250);
      body = parseNewsArticle(articleHtml, item.excerpt, item.coverImage);
    } catch (err) {
      console.warn(`  ! body fetch failed for ${item.slug}:`, err);
      body = parseNewsArticle('', item.excerpt, item.coverImage);
    }
    const excerpt = buildNewsExcerpt(null, body) || null;
    insert.run(item.title, item.slug, item.category, excerpt, body, sortOrder, item.publishedAt);
    console.log(`  + ${item.slug} (sort ${sortOrder})`);
    imported++;
  }

  console.log(`Imported ${imported} news posts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
