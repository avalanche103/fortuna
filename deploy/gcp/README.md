# GCP — минимум бюджета (Compute Engine + SQLite)

Always Free: **1× e2-micro** в `us-central1` / `us-west1` / `us-east1` + стандартный диск до лимита Free Tier.

## Быстрый старт

1. Установите [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) и войдите:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

2. Создайте VM (с хоста, где есть `bash` / WSL / Git Bash):

```bash
bash deploy/gcp/create-vm.sh
```

Скрипт поднимет `e2-micro` в `us-central1-a`, откроет порт 80 и по startup-script поставит Docker + сайт.  
БД и uploads хранятся в **`/var/lib/fortuna`** на диске VM — переживают обновления контейнера.

3. Откройте `http://EXTERNAL_IP/` и `/admin` (логин `fortuna`; пароль задайте через `.admin-pass` и `npm run db:set-admin`).

## Обновить код после пуша в GitHub

```bash
gcloud compute ssh fortuna --zone=us-central1-a --command='sudo bash /opt/fortuna/deploy/gcp/startup.sh'
```

Либо:

```bash
gcloud compute ssh fortuna --zone=us-central1-a
cd /opt/fortuna && sudo bash deploy/gcp/startup.sh
```

## Перенести локальные данные

```bash
# БД
gcloud compute scp --zone=us-central1-a data/fortuna.db fortuna:/tmp/fortuna.db
gcloud compute ssh fortuna --zone=us-central1-a --command='sudo docker compose -f /opt/fortuna/docker-compose.yml -f /opt/fortuna/docker-compose.override.yml down; sudo mkdir -p /var/lib/fortuna; sudo mv /tmp/fortuna.db /var/lib/fortuna/fortuna.db; cd /opt/fortuna && sudo docker compose up -d'

# Uploads (если есть)
gcloud compute scp --zone=us-central1-a --recurse public/uploads fortuna:/tmp/uploads
gcloud compute ssh fortuna --zone=us-central1-a --command='sudo mkdir -p /var/lib/fortuna/uploads; sudo cp -a /tmp/uploads/. /var/lib/fortuna/uploads/; cd /opt/fortuna && sudo docker compose restart'
```

## Важно по бюджету

- Регион Free Tier: **`us-central1` / `us-west1` / `us-east1`** (не Frankfurt).
- Машина: **`e2-micro`**, диск **pd-standard** ~20 GB.
- Внешний IP на Always Free — ephemeral; для стабильного IP нужен static (может тарифицироваться).
- HTTPS: Cloudflare перед IP (Flexible или Full) либо Caddy/`certbot` на VM. Откройте порт **443**. После сертификата в `.env`:
  `SITE_URL=https://fcfortuna.by` и `FORCE_HTTPS=1`, затем `docker compose up -d`.
- Следите за сроком сертификата (панель / UptimeRobot SSL / `openssl s_client`). Истёкший LE даёт «подключение не является частным».
- Проверка здоровья: `http://IP/healthz` должно отвечать `ok`.
- Бэкап SQLite: `npm run db:backup` (файлы в `data/backups/`).

## Переменные (в `.env` на VM)

| Ключ | Значение |
|------|----------|
| `SESSION_SECRET` | случайная строка (скрипт генерирует сам) |
| `SITE_URL` | `https://fcfortuna.by` после привязки домена |
| `FORCE_HTTPS` | `1` когда TLS работает |
| `DATA_DIR` | `/data` внутри контейнера (= `/var/lib/fortuna` на хосте) |
