# FC Fortuna — fcfortuna.by

Новая версия сайта детско-юношеского футбольного клуба «Фортуна».

**Стек:** Node.js, TypeScript, SQLite, Express, EJS

## Быстрый старт

```bash
npm install
npm run db:seed
npm run dev
```

Сайт: http://localhost:3000  
Админка: http://localhost:3000/admin (логин `admin` / `admin`)

## Деплой на Render

Проект заточен под долгоживущий Node-сервис (не Vercel serverless).

1. В [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** и укажите этот репозиторий  
   (или **Web Service** вручную с настройками из [`render.yaml`](render.yaml)).
2. Build: `npm ci --include=dev && npm run build && test -f dist/index.js && npm prune --omit=dev` · Start: `npm start` · Node **22+**.  
   Важно: без `--include=dev` TypeScript не ставится при `NODE_ENV=production`, и `dist/` не появляется.
3. Переменные: `NODE_ENV=production`, `SESSION_SECRET` (генерируется автоматически в Blueprint), `NODE_VERSION=22.14.0`.
4. После первого деплоя откройте `/admin` (`admin` / `admin`) и смените пароль.

Если сервис создавали вручную (не через Blueprint), в Settings → Build & Deploy поставьте тот же **Build Command**, иначе start упадёт с `Cannot find module .../dist/index.js`.

### Free plan — ограничения

На **free** нет Persistent Disk:

- SQLite и uploads живут на эфемерном диске инстанса;
- после **redeploy / sleep / restart** данные сбрасываются;
- сервис «засыпает» без трафика (первый запрос может ждать ~30–50 с).

Для продакшена с сохранением контента нужен план со диском (Starter+) и `DATA_DIR=/var/data` — см. историю `render.yaml` или README ниже.

Чтобы подтянуть контент после каждого деплоя на free: Shell → `npm run db:import` (или наполняйте админкой заново).

### Starter+ (с диском)

Добавьте в сервис Persistent Disk `mountPath: /var/data` и env `DATA_DIR=/var/data` — тогда БД и uploads сохраняются между деплоями.

Локальная разработка без `DATA_DIR` хранит БД в `data/` и файлы в `public/uploads/`.

## Сохранённые маршруты

| Путь | Раздел |
|------|--------|
| `/` | Главная (дашборд) |
| `/blog` | Новости |
| `/blog/:category/:slug` | Статья |
| `/vizitka` | Визитка |
| `/gruppy` | Группы |
| `/gruppy/:slug` | Группа |
| `/raspisanie` | Расписание |
| `/vospitanniki` | Воспитанники |
| `/arhiv` | Архив |
| `/arhiv/:year` | Архив по году |
| `/arhiv/fotogalereya` | Фотогалерея (внутри архива) |
| `/fotogalereya` | → 301 редирект на `/arhiv/fotogalereya` |

## Дизайн

- **Заголовки:** Barlow Condensed Bold
- **Текст:** Source Sans 3 Regular
- **Кнопки:** Oswald SemiBold
- **Цвета:** синий `#1a3a8f`, оранжевый `#f58220`

## Админка

- Новости, игроки, видео, визитка, расписание, площадки, текст набора на главной
- Загрузка фото в каталог uploads (локально `public/uploads/`, на Render — диск)

## Миграция с текущего сайта

Импорт данных с fcfortuna.by:

```bash
npm run db:import
```

Или двойной клик по `import.bat`.

Опции:

```bash
# Только выбранные разделы
npm run db:import -- --only=players,graduates,schedule

# Ограничить число страниц новостей (для теста)
npm run db:import -- --only=news --news-pages=3

# Подтянуть полный текст статей (дольше)
npm run db:import -- --only=news --fetch-bodies

# Скачать фото из альбомов галереи (очень долго)
npm run db:import -- --only=gallery --gallery-photos
```

Импортируется: новости, группы/игроки, воспитанники, расписание, визитка, видео, текст набора, архив и фотогалерея (метаданные альбомов).
