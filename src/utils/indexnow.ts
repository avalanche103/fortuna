import { INDEXNOW_KEY } from '../config/env';

export async function pingIndexNow(siteUrl: string, pageUrl: string): Promise<void> {
  const loc = pageUrl.startsWith('http') ? pageUrl : `${siteUrl.replace(/\/$/, '')}${pageUrl}`;
  const endpoint = `https://yandex.com/indexnow?url=${encodeURIComponent(loc)}&key=${encodeURIComponent(INDEXNOW_KEY)}`;
  try {
    await fetch(endpoint, { method: 'GET', redirect: 'follow' });
  } catch (err) {
    console.warn('IndexNow ping failed', err);
  }
}
