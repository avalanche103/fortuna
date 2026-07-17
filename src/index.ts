import express from 'express';
import session from 'express-session';
import path from 'path';
import { runMigrations } from './db';
import { ensureSeedData } from './db/seed';
import { UPLOAD_DIR, ensureDataDirs } from './paths';
import { getSettings, splitPlayerName } from './services/content';
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
app.use(express.urlencoded({ extended: true }));
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
  res.locals.currentPath = req.path;
  res.locals.splitPlayerName = splitPlayerName;
  res.locals.settings = getSettings();
  next();
});

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).render('pages/404', { title: 'Страница не найдена' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FC Fortuna running at http://0.0.0.0:${PORT}`);
});
