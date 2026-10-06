#!/usr/bin/env bash
# تجديد الشهادات (يجدّد فقط ما بقي له أقل من 30 يومًا) ثم يعيد تحميل Nginx بلا توقف.
# أضِفه إلى cron:   17 3 * * * cd /opt/school-system && ./deploy/renew-certs.sh >> backups/renew.log 2>&1
set -Eeuo pipefail
cd "$(dirname "$0")/.."
docker compose --profile tools run --rm --entrypoint certbot certbot renew --quiet --webroot -w /var/www/certbot
docker compose exec -T nginx-proxy nginx -t
docker compose exec -T nginx-proxy nginx -s reload
echo "$(date -Is) renew-check ok"
