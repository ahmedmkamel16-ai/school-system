#!/usr/bin/env bash
# نشر/تحديث نظام إدارة المدرسة بأمر واحد، بلا توقف ملحوظ للمستخدمين.
#
#   ./deploy.sh                نشر آخر نسخة (git pull ← بناء ← نسخة احتياطية ← migrations ← تحديث متدرّج)
#   ./deploy.sh --no-pull      بدون git pull (الكود موجود محليًا)
#   ./deploy.sh --skip-backup  بدون نسخة احتياطية قبل الترحيل (غير مستحسن)
#   ./deploy.sh rollback       العودة لصور النسخة السابقة (الـ migrations لا تُعكس تلقائيًا)
#   ./deploy.sh status         حالة الخدمات والصحة
#
# آلية عدم التوقف: صور جديدة تُبنى بجانب القديمة ← الـ migrations (إضافية فقط، متوافقة مع الكود القديم)
# تُنفَّذ بحاوية مؤقتة ← كل نسخة قديمة تُستبدل بجديدة بعد أن تصبح الجديدة سليمة (healthy).
set -Eeuo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose"
PULL=1; BACKUP=1; CMD="deploy"
for arg in "$@"; do
    case "$arg" in
        deploy|rollback|status) CMD="$arg" ;;
        --no-pull) PULL=0 ;;
        --skip-backup) BACKUP=0 ;;
        -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
        *) echo "وسيط غير معروف: $arg"; exit 2 ;;
    esac
done

log()  { printf '\033[1;34m→ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "فشل السكربت عند السطر $LINENO — الخدمات الحالية لم تُحذف؛ راجع: docker compose logs --tail=100 backend"' ERR

command -v docker >/dev/null || die "Docker غير مثبّت"
$COMPOSE version >/dev/null 2>&1 || die "docker compose (الإصدار 2) غير متاح"

check_env() {
    [ -f .env ] || die ".env غير موجود — انسخ .env.production.example إلى .env وعدّله"
    set -a; . ./.env; set +a
    [ -n "${DOMAIN:-}" ] && [ "$DOMAIN" != "school.example.com" ] || die "DOMAIN لم يُضبط في .env"
    [ -n "${SECRET_KEY:-}" ] && [ "${#SECRET_KEY}" -ge 32 ] && [[ "$SECRET_KEY" != CHANGE_ME* ]] || die "SECRET_KEY ضعيف/غير مضبوط (ولّده: openssl rand -hex 32)"
    [ -n "${POSTGRES_PASSWORD:-}" ] && [[ "$POSTGRES_PASSWORD" != CHANGE_ME* ]] || die "POSTGRES_PASSWORD غير مضبوط"
    if [ "$(stat -c '%a' .env 2>/dev/null || echo 600)" != "600" ]; then
        printf '\033[1;33m! صلاحيات .env مفتوحة؛ نضبطها 600\033[0m\n'; chmod 600 .env
    fi
}

# أقل من التوقّف: نستبدل نسخ الخدمة واحدة واحدة، مع نسخة إضافية مؤقتة (surge) تُنشأ قبل إيقاف القديمة
rolling_update() {
    local service="$1" replicas="$2" want_hash old
    want_hash="$($COMPOSE config --hash "$service" | awk '{print $2}')"
    mapfile -t ids < <($COMPOSE ps -q "$service")
    if [ "${#ids[@]}" -eq 0 ]; then
        log "$service: أول تشغيل ($replicas نسخة)"
        $COMPOSE up -d --no-deps --wait --scale "$service=$replicas" "$service"
        return
    fi
    local outdated=()
    for id in "${ids[@]}"; do
        # قديمة إن اختلف إعدادها (متغيرات/منافذ...) أو صورتها (كود جديد بنفس الوسم latest)
        old="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.config-hash" }}' "$id")"
        img_ref="$(docker inspect -f '{{.Config.Image}}' "$id")"
        if [ "$old" != "$want_hash" ] || [ "$(docker inspect -f '{{.Image}}' "$id")" != "$(docker image inspect -f '{{.Id}}' "$img_ref")" ]; then
            outdated+=("$id")
        fi
    done
    if [ "${#outdated[@]}" -eq 0 ] && [ "${#ids[@]}" -eq "$replicas" ]; then
        ok "$service: محدَّث أصلًا"; return
    fi
    log "$service: تحديث متدرّج لـ ${#outdated[@]} نسخة"
    for id in "${outdated[@]}"; do
        # نسخة جديدة (بالإعداد الحالي) بجانب القديمة، وننتظر سلامتها قبل إزالة القديمة
        $COMPOSE up -d --no-deps --no-recreate --wait --scale "$service=$(( $($COMPOSE ps -q "$service" | wc -l) + 1 ))" "$service"
        docker stop -t 35 "$id" >/dev/null && docker rm "$id" >/dev/null
    done
    # ضبط العدد النهائي (إن تغيّر BACKEND_REPLICAS)
    $COMPOSE up -d --no-deps --no-recreate --wait --scale "$service=$replicas" "$service"
    ok "$service: $($COMPOSE ps -q "$service" | wc -l) نسخة سليمة"
}

reload_proxy() {
    # يعيد توليد إعداد Nginx من القالب ويطبّقه بلا إسقاط اتصال
    $COMPOSE exec -T nginx-proxy sh -c '/docker-entrypoint.d/20-envsubst-on-templates.sh >/dev/null && nginx -t 2>&1 && nginx -s reload'
}

verify() {
    log "فحص الصحة عبر الخادم العكسي (Nginx ← backend ← PostgreSQL)..."
    local healthy=0
    for _ in $(seq 1 20); do
        if $COMPOSE exec -T nginx-proxy wget -q -O- http://127.0.0.1:8081/api/v1/health 2>/dev/null | grep -q '"ok"'; then healthy=1; break; fi
        sleep 3
    done
    [ "$healthy" = 1 ] || die "فحص الصحة فشل — راجع: docker compose logs --tail=100 backend nginx-proxy"
    # فحص خارجي عبر HTTPS (يكشف مشاكل DNS/الشهادة)؛ تحذير فقط حتى لا يُفشل نشرًا سليمًا
    if command -v curl >/dev/null && [ "${EXTERNAL_CHECK:-1}" = 1 ]; then
        if curl -fsS -m 10 -o /dev/null ${CURL_EXTRA:-} "https://$DOMAIN/healthz"; then ok "HTTPS يعمل: https://$DOMAIN"
        else printf '\033[1;33m! تعذّر الوصول إلى https://%s من هذا الخادم (تحقق من DNS/الشهادة/الجدار الناري)\033[0m\n' "$DOMAIN"; fi
    fi
    ok "النظام يعمل"
}

case "$CMD" in
status)
    check_env; $COMPOSE ps; verify ;;

rollback)
    check_env
    for svc in backend frontend; do
        docker image inspect "school-sis/$svc:previous" >/dev/null 2>&1 || die "لا توجد صورة سابقة لـ $svc"
        docker tag "school-sis/$svc:previous" "school-sis/$svc:latest"
    done
    log "العودة للصور السابقة (قاعدة البيانات تبقى كما هي؛ للاستعادة: scripts/backup.sh restore ...)"
    rolling_update backend "${BACKEND_REPLICAS:-2}"
    rolling_update frontend "${FRONTEND_REPLICAS:-2}"
    verify ;;

deploy)
    check_env
    if [ "$PULL" = 1 ] && [ -d .git ]; then
        log "git pull"; git pull --ff-only
    fi

    # احتفظ بالصور الحالية كـ :previous للرجوع السريع
    for svc in backend frontend; do
        docker image inspect "school-sis/$svc:latest" >/dev/null 2>&1 && docker tag "school-sis/$svc:latest" "school-sis/$svc:previous" || true
    done

    log "بناء الصور"
    # BUILD_PULL=0 يمنع جلب الصور الأساسية الأحدث (للخوادم بلا وصول لـ Docker Hub أو عند حدّ الطلبات)
    if [ "${BUILD_PULL:-1}" = 1 ]; then $COMPOSE build --pull backend frontend; else $COMPOSE build backend frontend; fi

    log "قاعدة البيانات"
    $COMPOSE up -d --wait db
    if [ "$BACKUP" = 1 ] && $COMPOSE exec -T db psql -U "${POSTGRES_USER:-school}" -d "${POSTGRES_DB:-school_sis}" -tAc "SELECT to_regclass('public.alembic_version')" 2>/dev/null | grep -q alembic_version; then
        log "نسخة احتياطية قبل الترحيل"; ./scripts/backup.sh
    fi

    log "الـ migrations (حاوية مؤقتة بالصورة الجديدة)"
    $COMPOSE run --rm --no-deps -e RUN_MIGRATIONS=0 backend python scripts/migrate.py

    rolling_update backend "${BACKEND_REPLICAS:-2}"
    rolling_update frontend "${FRONTEND_REPLICAS:-2}"

    log "الخادم العكسي"
    $COMPOSE up -d --no-deps --wait nginx-proxy
    reload_proxy

    verify
    docker image prune -f >/dev/null
    ok "اكتمل النشر"
    $COMPOSE ps ;;
esac
