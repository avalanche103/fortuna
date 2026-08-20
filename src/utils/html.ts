import sanitizeHtml from 'sanitize-html';

export function upgradeInsecureUrls(value: string): string {
  return value.replace(/\bhttp:\/\/(?!localhost|127\.0\.0\.1)([^"'\\\s>]+)/gi, 'https://$1');
}

export function sanitizeNewsHtml(html: string): string {
  const upgraded = upgradeInsecureUrls(html || '');
  return sanitizeHtml(upgraded, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'iframe',
      'h1',
      'h2',
      'span',
      'figure',
      'figcaption',
      'video',
      'source',
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'class'],
      iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'loading', 'referrerpolicy'],
      video: ['src', 'controls', 'width', 'height', 'poster'],
      source: ['src', 'type'],
      '*': ['class'],
    },
    allowedIframeHostnames: [
      'www.youtube.com',
      'youtube.com',
      'www.youtube-nocookie.com',
      'www.instagram.com',
      'www.facebook.com',
    ],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}
