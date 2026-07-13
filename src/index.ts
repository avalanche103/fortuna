import express from 'express';
import session from 'express-session';
import path from 'path';
import { runMigrations } from './db';
import publicRoutes from './routes/public';
import adminRoutes from './routes/admin';

runMigrations();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fortuna-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  })
);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).render('pages/404', { title: 'Страница не найдена' });
});

app.listen(PORT, () => {
  console.log(`FC Fortuna running at http://localhost:${PORT}`);
});
