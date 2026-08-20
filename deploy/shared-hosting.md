# Деплой на shared-хостинг (cPanel / Timeweb / Beget / REG.RU)

Новый сайт — **Node.js 22+** и **SQLite-файл**. Это не PHP и не MySQL: phpMyAdmin не нужен.

Нужно выложить: **код** (шаблоны, `public/` без пользовательских фото). Файл `data/fortuna.db` на хостинге **не перезаписывать** — там боевые новости и расписание.

## 0. Что должно быть в панели

- Node.js **22.x** (нужен встроенный `node:sqlite`)
- Долгоживущий процесс (Setup Node.js App / Passenger / «режим Node.js»)
- FTP или файловый менеджер; лучше ещё SSH-терминал для `npm install`

Если в панели нет Node 22 — сайт не запустится. Просите хостера включить 22 или пишите нам.

## 1. Старый сайт — zip в сторонке, не удалять

В файловом менеджере хостинга:

1. Создайте папку **вне корня сайта**, например `backups` рядом с `public_html` (не внутри него).
2. Запакуйте текущий корень домена (`public_html` / `www` / `fcfortuna.by`) в  
   `backups/fcfortuna-old-2026-08-18.zip`.
3. Откройте архив и убедитесь, что внутри есть `index.php` и картинки.
4. **Не чистите** старые файлы, пока новый сайт не откроется по домену.

Откат: выключить Node-приложение в панели, распаковать zip обратно в корень.

## 2. Пакет с компьютера

На Windows в папке проекта (сначала остановите `npm run dev`, если он запущен):

```powershell
.\deploy\pack-for-hosting.ps1
```

Появится папка `dist-deploy/code` и архив `dist-deploy/fortuna-hosting-code.zip` — код и шаблоны **без базы**. Боевой `data/fortuna.db` на хостинге не трогать.

Чтобы упаковать ещё и локальную базу (только для первой установки):

```powershell
.\deploy\pack-for-hosting.ps1 -IncludeDb
```

| Что | Куда на хостинге |
|-----|------------------|
| `dist-deploy/code/` | корень Node-приложения, например `~/fortuna` |
| `public/uploads/` (с вашего диска) | `~/fortuna/public/uploads/` |

`node_modules` в пакет не входит — их ставят **на сервере**. Фото (~5 ГБ, больше 20 тысяч файлов) лучше лить отдельно через FileZilla, бинарный режим.

## 3. Создать Node-приложение

Типичные поля панели:

- **Application root:** `fortuna` (или полный путь к папке с `package.json`)
- **Application URL:** `fcfortuna.by` (корень домена)
- **Node version:** 22
- **Startup file:** `app.js` (Passenger / cPanel)
- **Start command** (если панель просит команду): `npm start`

Переменные окружения:

| Ключ | Значение |
|------|----------|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | длинная случайная строка (не из документации) |
| `SITE_URL` | `https://fcfortuna.by` |
| `PORT` | то, что выдаёт панель; не хардкодить 3000 |

`DATA_DIR` можно не ставить: база живёт в `data/fortuna.db` рядом с кодом.

`SESSION_SECRET` можно сгенерировать так:

```powershell
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
```

## 4. Залить файлы и поставить зависимости

1. По FTP залейте `dist-deploy/code/` в папку приложения.
2. Залейте локальную папку `public/uploads/` в `public/uploads/` на сервере (~5 ГБ).
3. В SSH / терминале панели из корня приложения:

```bash
npm ci --omit=dev
```

Если `npm ci` ругается — `npm install --omit=dev`.

Зависимость `bcryptjs` чистый JavaScript, компилятор на хостинге не нужен.

## 5. Запуск и домен

1. Запустите приложение в панели (Restart / Enable).
2. Привяжите домен к Node-приложению, чтобы запросы не уходили в старый `index.php`.
3. Включите HTTPS (Let's Encrypt в панели) на **оба** имени: `fcfortuna.by` и `www.fcfortuna.by`.
4. В панели включите редирект HTTP → HTTPS, если он есть. Приложение тоже редиректит, если `SITE_URL` начинается с `https://`.
5. Проверьте: `https://fcfortuna.by/healthz` → `ok`; `http://fcfortuna.by/` должен 301 на HTTPS.
6. Поставьте внешний мониторинг (UptimeRobot) на HTTPS и срок SSL.
7. Подключите сайт в [Яндекс.Вебмастере](https://webmaster.yandex.ru/) и [Google Search Console](https://search.google.com/search-console) на канонический HTTPS-хост. Sitemap: `https://fcfortuna.by/sitemap.xml`.
8. Проверьте [Safe Browsing](https://transparencyreport.google.com/safe-browsing/search?url=fcfortuna.by).
9. Бэкап базы: в SSH `npm run db:backup` (копии в `data/backups/`).

phpMyAdmin **не открывать**: база уже лежит файлом `data/fortuna.db`. Если есть `fortuna.db-wal` / `fortuna.db-shm`, залейте их тоже (после `pack-for-hosting.ps1` WAL обычно уже слит в основной файл).

## 6. Проверка

- https://fcfortuna.by/ — главная
- Новости, группы, расписание, архив, фотогалерея — картинки с `/uploads/` и `/images/`
- https://fcfortuna.by/admin — логин **`fortuna`**, пароль тот, что выдан при подготовке базы (не из git)

Zip старого сайта оставьте в `backups/`.
