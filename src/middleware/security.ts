import helmet from 'helmet';
import { shouldForceHttps } from '../config/env';

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://www.googletagmanager.com',
          'https://www.google-analytics.com',
          'https://mc.yandex.ru',
          'https://mc.yandex.by',
          'https://mc.yandex.com',
          'https://yastatic.net',
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'"],
        connectSrc: [
          "'self'",
          'https://www.google-analytics.com',
          'https://www.googletagmanager.com',
          'https://*.google-analytics.com',
          'https://*.analytics.google.com',
          'https://*.googletagmanager.com',
          'https://mc.yandex.ru',
          'https://mc.yandex.by',
          'https://mc.yandex.com',
          'wss://mc.yandex.ru',
          'wss://mc.yandex.by',
          'wss://mc.yandex.com',
        ],
        childSrc: ['blob:', 'https://mc.yandex.ru', 'https://mc.yandex.com'],
        frameSrc: [
          "'self'",
          'blob:',
          'https://www.youtube.com',
          'https://www.youtube-nocookie.com',
          'https://www.instagram.com',
          'https://www.facebook.com',
          'https://mc.yandex.ru',
          'https://mc.yandex.com',
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        ...(shouldForceHttps() ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: false,
  });
}
