#!/usr/bin/env bash
# Creates a Free Tier-friendly e2-micro VM in us-central1 and opens HTTP.
# Prerequisites: gcloud auth login && gcloud config set project YOUR_PROJECT_ID
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
ZONE="${ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-fortuna}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-micro}"
DISK_SIZE_GB="${DISK_SIZE_GB:-20}"
REPO_URL="${REPO_URL:-https://github.com/avalanche103/fortuna.git}"
BRANCH="${BRANCH:-main}"

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "Set PROJECT_ID or: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

echo "Project: $PROJECT_ID  Zone: $ZONE  VM: $VM_NAME ($MACHINE_TYPE)"

gcloud services enable compute.googleapis.com --project="$PROJECT_ID"

# Allow HTTP (idempotent)
gcloud compute firewall-rules describe allow-http-fortuna --project="$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud compute firewall-rules create allow-http-fortuna \
       --project="$PROJECT_ID" \
       --allow=tcp:80 \
       --target-tags=http-server \
       --description="FC Fortuna HTTP"

STARTUP_SCRIPT="$(cd "$(dirname "$0")" && pwd)/startup.sh"

gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" >/dev/null 2>&1 \
  && echo "VM already exists: $VM_NAME" \
  || gcloud compute instances create "$VM_NAME" \
       --project="$PROJECT_ID" \
       --zone="$ZONE" \
       --machine-type="$MACHINE_TYPE" \
       --image-family=debian-12 \
       --image-project=debian-cloud \
       --boot-disk-size="${DISK_SIZE_GB}GB" \
       --boot-disk-type=pd-standard \
       --tags=http-server \
       --metadata "REPO_URL=${REPO_URL}" \
       --metadata "BRANCH=${BRANCH}" \
       --metadata-from-file=startup-script="$STARTUP_SCRIPT"

echo
echo "Waiting for external IP..."
IP="$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
echo "Site:  http://$IP/"
echo "Admin: http://$IP/admin  (admin / admin)"
echo
echo "SSH:   gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID"
echo "Logs:  gcloud compute ssh $VM_NAME --zone=$ZONE --command='cd /opt/fortuna && sudo docker compose logs -f --tail=100'"
echo
echo "Copy local DB (optional):"
echo "  gcloud compute scp --zone=$ZONE data/fortuna.db ${VM_NAME}:/tmp/fortuna.db"
echo "  gcloud compute ssh $VM_NAME --zone=$ZONE --command='sudo docker compose -f /opt/fortuna/docker-compose.yml -f /opt/fortuna/docker-compose.override.yml down; sudo mv /tmp/fortuna.db /var/lib/fortuna/fortuna.db; cd /opt/fortuna && sudo docker compose up -d'"
