#!/usr/bin/env bash
# أول إصدار لشهادة Let's Encrypt:
#   1) شهادة مؤقتة ذاتية التوقيع كي يقلع Nginx   2) إصدار الحقيقية عبر HTTP-01   3) إعادة تحميل Nginx
# الاستخدام (من جذر المشروع):  ./deploy/init-letsencrypt.sh        (إنتاج)
#                              STAGING=1 ./deploy/init-letsencrypt.sh   (تجربة بلا استهلاك حدود LE)
set -Eeuo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "✗ .env غير موجود (انسخ .env.production.example)"; exit 1; }
set -a; . ./.env; set +a
: "${DOMAIN:?}" "${LETSENCRYPT_EMAIL:?}"

CONF=deploy/certbot/conf
LIVE="$CONF/live/$DOMAIN"
mkdir -p "$LIVE" deploy/certbot/www

if [ -f "$LIVE/fullchain.pem" ] && ! grep -q "school-sis-dummy" "$LIVE/.marker" 2>/dev/null; then
    echo "✓ توجد شهادة فعلية لـ $DOMAIN — لا حاجة للإصدار (للتجديد: deploy/renew-certs.sh)"
    exit 0
fi

make_dummy_cert() {
    mkdir -p "$LIVE"
    if command -v openssl >/dev/null; then
        openssl req -x509 -nodes -newkey rsa:2048 -days 2 -keyout "$LIVE/privkey.pem" -out "$LIVE/fullchain.pem" -subj "/CN=$DOMAIN" 2>/dev/null
    else
        docker run --rm -v "$PWD/$LIVE:/out" alpine/openssl req -x509 -nodes -newkey rsa:2048 -days 2 \
            -keyout /out/privkey.pem -out /out/fullchain.pem -subj "/CN=$DOMAIN" 2>/dev/null
    fi
    echo "school-sis-dummy" > "$LIVE/.marker"
}

echo "→ إنشاء شهادة مؤقتة (كي يقلع Nginx قبل الحصول على الحقيقية)..."
make_dummy_cert

echo "→ تشغيل الخدمات..."
docker compose up -d --wait

echo "→ طلب الشهادة الحقيقية لـ $DOMAIN (يجب أن يشير DNS إلى هذا الخادم والمنفذ 80 مفتوح)..."
rm -rf "$CONF/live/$DOMAIN" "$CONF/archive/$DOMAIN" "$CONF/renewal/$DOMAIN.conf"
STAGING_FLAG=""
[ "${STAGING:-0}" = "1" ] && STAGING_FLAG="--staging"
if ! docker compose --profile tools run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
        -d "$DOMAIN" --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive $STAGING_FLAG; then
    echo "✗ فشل الحصول على الشهادة (تحقق من DNS والمنفذ 80)، نُعيد الشهادة المؤقتة كي لا يتعطل Nginx عند أي إعادة تشغيل"
    make_dummy_cert
    exit 1
fi

echo "→ إعادة تحميل Nginx..."
docker compose exec -T nginx-proxy nginx -t
docker compose exec -T nginx-proxy nginx -s reload
echo "✓ تم. افتح https://$DOMAIN"
