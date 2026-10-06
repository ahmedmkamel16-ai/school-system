#!/usr/bin/env bash
# نسخة احتياطية مضغوطة من قاعدة البيانات إلى backups/ مع تدوير القديمة — تعمل مع Supabase (الافتراضي) ومع القاعدة المحلية.
#   ./scripts/backup.sh                                  نسخة جديدة
#   ./scripts/backup.sh restore backups/<ملف>.sql.gz     استعادة (تستبدل جداول التطبيق الحالية!)
#
# Supabase: يُنفَّذ pg_dump من حاوية postgres مؤقتة (PG_CLIENT_IMAGE، يجب أن يساوي أو يفوق إصدار مشروعك)
# على مخطط public فقط (مخططات Supabase الداخلية auth/storage لا تُمسّ)، وعبر MIGRATION_DATABASE_URL (5432 / Session)
# إن وُجد لأن المنفذ 6543 لا يناسب pg_dump. بدائل/إضافة: نسخ Supabase اليومية (الخطط المدفوعة).
set -Eeuo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }
KEEP="${BACKUP_KEEP:-14}"
PG_IMAGE="${PG_CLIENT_IMAGE:-postgres:17-alpine}"
mkdir -p backups

use_local_db() { [[ ",${COMPOSE_PROFILES:-}," == *",localdb,"* ]]; }

# رابط libpq من رابط التطبيق: بلا +psycopg ولا معاملات غير معروفة (pgbouncer=true...)
libpq_url() {
    local url="${MIGRATION_DATABASE_URL:-${DATABASE_URL:-}}"
    [ -n "$url" ] || { echo "✗ DATABASE_URL غير مضبوط" >&2; return 1; }
    printf '%s' "$url" | sed -E 's#^postgres(ql)?(\+[a-z0-9]+)?://#postgresql://#; s/[?&](pgbouncer|connection_limit)=[^&]*//g; s/\?&/?/; s/\?$//'
}

remote_pg() {  # remote_pg <أمر ...> — يمرّر الرابط عبر متغير بيئة (لا يظهر في قائمة العمليات)
    docker run --rm -i ${BACKUP_DOCKER_NETWORK:+--network "$BACKUP_DOCKER_NETWORK"} -e "DBURL=$(libpq_url)" -e PGSSLMODE="${PGSSLMODE:-require}" "$PG_IMAGE" "$@"
}

if [ "${1:-}" = "restore" ]; then
    FILE="${2:?حدّد ملف النسخة}"; [ -f "$FILE" ] || { echo "✗ الملف غير موجود"; exit 1; }
    read -r -p "ستُستبدل جداول التطبيق الحالية في القاعدة بمحتوى $FILE — اكتب YES للمتابعة: " ANSWER
    [ "$ANSWER" = "YES" ] || { echo "أُلغي"; exit 1; }
    docker compose stop backend frontend nginx-proxy
    if use_local_db; then
        DB="${POSTGRES_DB:-school_sis}"; USER_="${POSTGRES_USER:-school}"
        docker compose exec -T db psql -U "$USER_" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" -c "CREATE DATABASE \"$DB\" OWNER \"$USER_\""
        gunzip -c "$FILE" | docker compose exec -T db psql -U "$USER_" -d "$DB" -v ON_ERROR_STOP=1 -q
    else
        # الملف يحوي DROP ... IF EXISTS ثم CREATE (pg_dump --clean) فلا حاجة لحذف القاعدة (غير مسموح في Supabase)
        gunzip -c "$FILE" | remote_pg sh -c 'psql "$DBURL" -v ON_ERROR_STOP=1 -q'
    fi
    docker compose up -d --wait
    echo "✓ تمت الاستعادة"; exit 0
fi

OUT="backups/school-sis-$(date +%Y-%m-%dT%H%M).sql.gz"
if use_local_db; then
    docker compose exec -T db pg_dump -U "${POSTGRES_USER:-school}" -d "${POSTGRES_DB:-school_sis}" --no-owner --clean --if-exists | gzip -9 > "$OUT.partial"
else
    remote_pg sh -c 'pg_dump "$DBURL" --schema=public --no-owner --no-privileges --clean --if-exists' | gzip -9 > "$OUT.partial"
fi
# pipefail يفشل السكربت إن فشل pg_dump؛ نتأكد أيضًا أن الملف ليس فارغًا
[ "$(gunzip -c "$OUT.partial" | head -c 200 | wc -c)" -gt 100 ] || { rm -f "$OUT.partial"; echo "✗ النسخة فارغة" >&2; exit 1; }
mv "$OUT.partial" "$OUT"
chmod 600 "$OUT"
echo "✓ $OUT ($(du -h "$OUT" | cut -f1))"
ls -1t backups/school-sis-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
