export function youtubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return match ? match[1] : null;
}

export function youtubeWatchUrl(url: string): string {
  const id = youtubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}

export function youtubeEmbedUrl(url: string): string {
  const id = youtubeVideoId(url);
  return id ? `https://www.youtube.com/embed/${id}` : url;
}

export function youtubeThumb(url: string): string {
  const id = youtubeVideoId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '';
}

export async function fetchYoutubeTitle(url: string): Promise<string | null> {
  const watchUrl = youtubeWatchUrl(url);
  const id = youtubeVideoId(watchUrl);
  if (!id) return null;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    const response = await fetch(oembedUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'FCFortuna/1.0' },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { title?: string };
    const title = data.title?.trim();
    return title || null;
  } catch {
    return null;
  }
}

export async function resolveYoutubeTitle(url: string, fallback: string): Promise<string> {
  return (await fetchYoutubeTitle(url)) ?? fallback;
}
