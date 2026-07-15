#!/usr/bin/env bash
# First-boot / update script for a cheap GCP VM (Docker + persistent /data).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fortuna}"
DATA_DIR="${DATA_DIR:-/var/lib/fortuna}"

meta() {
  curl -fsS -H 'Metadata-Flavor: Google' \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" 2>/dev/null || true
}

REPO_URL="${REPO_URL:-$(meta REPO_URL)}"
REPO_URL="${REPO_URL:-https://github.com/avalanche103/fortuna.git}"
BRANCH="${BRANCH:-$(meta BRANCH)}"
BRANCH="${BRANCH:-main}"

export DEBIAN_FRONTEND=noninteractive

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl git
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker-compose-plugin
fi

mkdir -p "$DATA_DIR" "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
fi

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  SECRET="$(openssl rand -hex 32)"
  cat > .env <<EOF
SESSION_SECRET=${SECRET}
DATA_DIR=/data
NODE_ENV=production
EOF
fi

# Bind host persistent dir into compose volume by overriding compose file.
cat > docker-compose.override.yml <<EOF
services:
  web:
    volumes:
      - ${DATA_DIR}:/data
EOF

docker compose pull || true
docker compose build --pull
docker compose up -d --remove-orphans

echo "Fortuna is up. DATA_DIR=${DATA_DIR}"
echo "Admin: http://$(curl -s ifconfig.me || echo SERVER_IP)/admin  (admin / admin — change password)"
