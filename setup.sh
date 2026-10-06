#!/usr/bin/env bash
# معالج الإعداد الأول: يسألك أسئلة بسيطة ثم يولّد .env كاملًا (يرمّز كلمة مرور Supabase، يبني رابطَي الاتصال،
# يولّد SECRET_KEY) ويقترح الخطوات التالية. كلمة المرور لا تظهر ولا تُحفظ إلا داخل .env (صلاحيات 600).
#
#   ./setup.sh
set -Eeuo pipefail
cd "$(dirname "$0")"

log() { printf '\033[1;34m→ %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ask() { # ask "السؤال" "الافتراضي" ⇒ يضع الجواب في REPLY
    local prompt="$1" default="${2:-}"
    if [ -n "$default" ]; then read -r -p "$prompt [$default]: " REPLY || REPLY=""; REPLY="${REPLY:-$default}"
    else read -r -p "$prompt: " REPLY || REPLY=""; fi
}
yes_no() { local r; read -r -p "$1 [Y/n]: " r || r="n"; [[ "${r:-Y}" =~ ^[Yy]?$ ]]; }

command -v python3 >/dev/null || die "python3 مطلوب (sudo apt install python3)"
command -v openssl >/dev/null || die "openssl مطلوب"
[ -f .env.production.example ] || die "شغّل السكربت من جذر المشروع"

if [ -f .env ]; then
    yes_no ".env موجود. أستبدله (تُحفظ نسخة .env.bak)؟" || die "أُلغي — لم يتغير شيء"
    cp .env .env.bak && chmod 600 .env.bak
fi

echo
log "1/4  النطاق"
ask "النطاق الذي يشير DNS إلى هذا الخادم (بدون https://)" "school.example.com"; DOMAIN="$REPLY"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "نطاق غير صالح: $DOMAIN"
ask "بريد تنبيهات Let's Encrypt" ""; EMAIL="$REPLY"
[[ "$EMAIL" =~ ^[^@\ ]+@[^@\ ]+\.[^@\ ]+$ ]] || die "بريد غير صالح"

echo
log "2/4  Supabase"
echo "الصق رابط Transaction pooler من لوحة Supabase (Connect ← URI ← Transaction pooler) كما هو، حتى مع [YOUR-PASSWORD]."
ask "الرابط" "postgresql://postgres.obqitxyafaoxdmrgaplr:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"; SUPA_URI="$REPLY"
read -r -s -p "كلمة مرور قاعدة البيانات (لا تظهر أثناء الكتابة): " SUPA_PASSWORD || SUPA_PASSWORD=""; echo
[ -n "$SUPA_PASSWORD" ] || die "كلمة المرور فارغة"

log "3/4  توليد الأسرار وكتابة .env"
export DOMAIN EMAIL SUPA_URI SUPA_PASSWORD SECRET_KEY="$(openssl rand -hex 32)"
python3 - <<'PY'
import os, re, sys, urllib.parse

uri = os.environ["SUPA_URI"].strip()
m = re.match(r"^postgres(?:ql)?://([^:]+):.*@([^:/@]+):(\d+)/([^?]+)", uri)
if not m:
    sys.exit("✗ شكل الرابط غير مفهوم. المطلوب: postgresql://postgres.<REF>:[YOUR-PASSWORD]@aws-0-<REGION>.pooler.supabase.com:6543/postgres")
user, host, port, dbname = m.groups()
if not host.endswith((".supabase.com", ".supabase.co")):
    sys.exit("✗ المضيف ليس من Supabase: " + host)
if host.startswith("db.") and host.endswith(".supabase.co"):
    sys.exit("✗ هذا الرابط المباشر (IPv6 فقط) ولا يعمل على VPS عادي. اختر Method = Transaction pooler من اللوحة.")
if not user.startswith("postgres."):
    sys.exit("✗ اسم المستخدم مع المجمّع يجب أن يكون postgres.<REF> (انسخ الرابط من اللوحة)")
if port != "6543":
    print(f"! المنفذ {port} وليس 6543: سيُستخدم كما هو لـ DATABASE_URL")

password = urllib.parse.quote(os.environ["SUPA_PASSWORD"], safe="")
def build(p): return f"postgresql://{user}:{password}@{host}:{p}/{dbname}?sslmode=require"
values = {
    "DOMAIN": os.environ["DOMAIN"],
    "LETSENCRYPT_EMAIL": os.environ["EMAIL"],
    "SECRET_KEY": os.environ["SECRET_KEY"],
    "DATABASE_URL": "'" + build(port) + "'",
    "MIGRATION_DATABASE_URL": "'" + build("5432") + "'",
}
lines = open(".env.production.example", encoding="utf-8").read().splitlines()
seen = set()
for i, line in enumerate(lines):
    key = line.split("=", 1)[0]
    if key in values and not line.startswith("#"):
        lines[i] = f"{key}={values[key]}"
        seen.add(key)
missing = set(values) - seen
if missing:
    sys.exit(f"✗ مفاتيح غير موجودة في القالب: {missing}")
fd = os.open(".env", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print(f"✓ كُتب .env للمشروع {user.split('.', 1)[1]} على {host}")
PY
unset SUPA_PASSWORD SECRET_KEY
chmod 600 .env
ok ".env جاهز (صلاحيات 600). احفظ SECRET_KEY من داخله في مدير كلمات مرور."

echo
log "4/4  الخطوات التالية"
if yes_no "أبني الصور وأفحص الاتصال بـ Supabase الآن؟"; then
    docker compose build backend
    docker compose run --rm --no-deps -e RUN_MIGRATIONS=0 backend python scripts/check_db.py || die "فشل فحص Supabase — راجع الرسالة أعلاه (وجدول الأخطاء في DEPLOYMENT.md)"
    ok "Supabase سليم"
    echo
    echo "تأكد أن DNS للنطاق $DOMAIN يشير لهذا الخادم والمنفذ 80 مفتوح، ثم:"
    if yes_no "أشغّل النظام وأصدر شهادة SSL الآن (init-letsencrypt)؟"; then
        ./deploy/init-letsencrypt.sh
        if yes_no "أنشئ حساب المدير الآن؟"; then
            ask "بريد المدير" "$EMAIL"; ADMIN_EMAIL="$REPLY"
            ask "اسم المدير" "مدير النظام"; ADMIN_NAME="$REPLY"
            docker compose exec backend python scripts/create_admin.py --email "$ADMIN_EMAIL" --name "$ADMIN_NAME"
        fi
        ok "جاهز: https://$DOMAIN"
        exit 0
    fi
fi
echo
echo "لاحقًا:  ./deploy/init-letsencrypt.sh   ثم   docker compose exec backend python scripts/create_admin.py --email ... --name ..."
echo "وللتحديثات بعد ذلك:  ./deploy.sh"
