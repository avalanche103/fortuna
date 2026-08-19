import express from 'express';
import session from 'express-session';
import fs from 'fs';
import path from 'path';
import { runMigrations } from './db';
import { ensureSeedData } from './db/seed';
import { UPLOAD_DIR, ensureDataDirs } from './paths';
import { getGruppyGroups, getSettings, splitPlayerName } from './services/content';
import publicRoutes from './routes/public';
import adminRoutes from './routes/admin';

ensureDataDirs();
runMigrations();
ensureSeedData();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
// Schedule month grid posts many slot fields (days × groups × times/locations).
app.use(express.urlencoded({ extended: true, limit: '2mb', parameterLimit: 50000 }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fortuna-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      secure: 'auto',
      sameSite: 'lax',
    },
  })
);

app.use((req, res, next) => {
  const host = req.get('host') || 'localhost:3000';
  res.locals.siteUrl = (process.env.SITE_URL || `${req.protocol}://${host}`).replace(/\/$/, '');
  res.locals.currentPath = req.path;
  res.locals.splitPlayerName = splitPlayerName;
  res.locals.settings = getSettings();
  res.locals.navGroups = getGruppyGroups();
  next();
});

app.use('/', publicRoutes);
app.use('/admin', (req, res, next) => {
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
