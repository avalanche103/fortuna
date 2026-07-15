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

3. Откройте `http://EXTERNAL_IP/` и `/admin` (`admin` / `admin`), сразу смените пароль.

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
- HTTPS: позже бесплатно через Cloudflare перед IP или Caddy/`certbot` на VM.

## Переменные (в `.env` на VM)

| Ключ | Значение |
|------|----------|
| `SESSION_SECRET` | случайная строка (скрипт генерирует сам) |
| `DATA_DIR` | `/data` внутри контейнера (= `/var/lib/fortuna` на хосте) |
