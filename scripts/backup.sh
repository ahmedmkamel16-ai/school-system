#!/usr/bin/env bash
# نسخة احتياطية مضغوطة من PostgreSQL إلى backups/ مع تدوير النسخ القديمة.
#   ./scripts/backup.sh            (يدويًا أو من cron)
#   ./scripts/backup.sh restore backups/school-sis-2026-10-06T0300.sql.gz   (استعادة — تستبدل البيانات الحالية!)
set -Eeuo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }
DB="${POSTGRES_DB:-school_sis}"; USER_="${POSTGRES_USER:-school}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p backups

if [ "${1:-}" = "restore" ]; then
    FILE="${2:?حدّد ملف النسخة}"; [ -f "$FILE" ] || { echo "✗ الملف غير موجود"; exit 1; }
    read -r -p "سيُحذف المحتوى الحالي لقاعدة $DB ويُستبدل بـ $FILE — اكتب YES للمتابعة: " ANSWER
    [ "$ANSWER" = "YES" ] || { echo "أُلغي"; exit 1; }
    docker compose stop backend frontend nginx-proxy
    docker compose exec -T db psql -U "$USER_" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" -c "CREATE DATABASE \"$DB\" OWNER \"$USER_\""
    gunzip -c "$FILE" | docker compose exec -T db psql -U "$USER_" -d "$DB" -v ON_ERROR_STOP=1 -q
    docker compose up -d --wait
    echo "✓ تمت الاستعادة"; exit 0
fi

OUT="backups/school-sis-$(date +%Y-%m-%dT%H%M).sql.gz"
# --clean --if-exists: الملف يعيد بناء الجداول فوق قاعدة موجودة؛ pipefail يفشل السكربت إن فشل pg_dump
docker compose exec -T db pg_dump -U "$USER_" -d "$DB" --no-owner --clean --if-exists | gzip -9 > "$OUT.partial"
mv "$OUT.partial" "$OUT"
chmod 600 "$OUT"
echo "✓ $OUT ($(du -h "$OUT" | cut -f1))"
ls -1t backups/school-sis-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
