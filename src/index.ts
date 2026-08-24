import {
  loadEnvFile,
  assertProductionConfig,
  getSessionSecret,
  isProduction,
  resolveSiteUrl,
  shouldForceHttps,
} from './config/env';
import express from 'express';
import session from 'express-session';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import { runMigrations } from './db';
import { ensureSessionTable, SqliteSessionStore } from './db/session-store';
import { ensureSeedData } from './db/seed';
import { UPLOAD_DIR, ensureDataDirs } from './paths';
import { getGruppyGroups, getSettings, splitPlayerName, invalidateContentCache } from './services/content';
import { canonicalRedirect } from './middleware/canonical';
import { securityHeaders } from './middleware/security';
import { attachCsrfToken, verifyCsrf } from './middleware/csrf';
import { thumbnailUrl } from './utils/thumbnails';
import db from './db';
import publicRoutes from './routes/public';
import adminRoutes from './routes/admin';

loadEnvFile();
assertProductionConfig();
ensureDataDirs();
runMigrations();
ensureSessionTable();
ensureSeedData();

const app = express();
app.locals.assetVersion = '20260824e';
const PORT = Number(process.env.PORT) || 3000;
const staticMaxAge = isProduction ? '7d' : 0;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.disable('x-powered-by');

app.use(securityHeaders());
app.use(canonicalRedirect);
app.use(compression());

app.get('/healthz', (_req, res) => {
  try {
    db.prepare('SELECT 1 AS ok').get();
    res.type('text/plain').send('ok');
  } catch (err) {
    console.error(err);
    res.status(503).type('text/plain').send('db');
  }
});

app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: staticMaxAge,
    etag: true,
    setHeaders(res, filePath) {
      if (/\.(?:woff2|woff|ttf|png|jpe?g|gif|webp|svg|ico)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      }
    },
  })
);
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ext = path.extname(req.path).toLowerCase();
  if (['.html', '.htm', '.svg', '.js', '.mjs', '.xml'].includes(ext)) {
    res.setHeader('Content-Disposition', 'attachment');
    res.type('text/plain');
  }
  next();
});
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: staticMaxAge,
    etag: true,
    index: false,
  })
);

app.use(express.urlencoded({ extended: true, limit: '2mb', parameterLimit: 50000 }));
app.use(
  session({
    name: 'fortuna.sid',
    secret: getSessionSecret(),
    store: new SqliteSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: shouldForceHttps() ? true : 'auto',
      sameSite: 'lax',
    },
  })
);
app.use(attachCsrfToken);
app.use(verifyCsrf);

app.use((req, res, next) => {
  if (req.path.startsWith('/admin') && req.method !== 'GET' && req.method !== 'HEAD') {
    invalidateContentCache();
  }
  const host = req.get('host') || 'localhost:3000';
  res.locals.siteUrl = resolveSiteUrl(req.protocol, host);
  res.locals.currentPath = req.path;
  res.locals.splitPlayerName = splitPlayerName;
  res.locals.settings = getSettings();
  res.locals.navGroups = getGruppyGroups();
  res.locals.thumb = thumbnailUrl;
  next();
});

app.use('/', publicRoutes);
app.use('/admin', (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use('/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).render('pages/404', {
    title: 'Страница не найдена',
    robots: 'noindex, follow',
  });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  res.locals.settings = res.locals.settings || {};
  res.locals.navGroups = res.locals.navGroups || [];
  res.locals.siteUrl = res.locals.siteUrl || process.env.SITE_URL || '';
  try {
    res.status(500).render('pages/500', {
      title: 'Ошибка сервера',
      robots: 'noindex, follow',
    });
  } catch (renderErr) {
    console.error(renderErr);
    res.status(500).type('text/plain').send('Internal Server Error');
  }
});

declare const PhusionPassenger: { configure: (opts: { autoInstall: boolean }) => void } | undefined;

function startServer(): void {
  if (typeof PhusionPassenger !== 'undefined') {
    PhusionPassenger.configure({ autoInstall: false });
    app.listen('passenger');
    console.log('FC Fortuna running under Passenger');
    return;
  }

  const socket = process.env.SOCKET;
  if (socket) {
    if (fs.existsSync(socket)) fs.unlinkSync(socket);
    app.listen(socket, () => {
      fs.chmodSync(socket, 0o660);
      console.log(`FC Fortuna listening on socket ${socket}`);
    });
    return;
  }

  const host = process.env.INSTANCE_HOST || '0.0.0.0';
  app.listen(PORT, host, () => {
    console.log(`FC Fortuna running at http://${host}:${PORT}`);
  });
}

startServer();
