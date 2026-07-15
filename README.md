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
2. Нужен план со **Persistent Disk** (Starter и выше): диск монтируется в `/var/data` для SQLite и загрузок.
3. Build: `npm ci && npm run build` · Start: `npm start` · Node **22+**.
4. Переменные: `DATA_DIR=/var/data`, `NODE_ENV=production`, `SESSION_SECRET` (генерируется автоматически в Blueprint).
5. После первого деплоя откройте `/admin` (`admin` / `admin`) и смените пароль.  
   Контент можно наполнить через админку или одноразовым Shell: `npm run db:import`.

Локальная разработка без `DATA_DIR` по-прежнему хранит БД в `data/` и файлы в `public/uploads/`.

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
