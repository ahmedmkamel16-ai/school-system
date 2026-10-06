# دليل النشر على VPS (Docker + Nginx + HTTPS) مع Supabase كقاعدة بيانات

دليل خطوة بخطوة لنشر نظام إدارة المدرسة: **الخادم والواجهة والخادم العكسي على VPS عبر Docker Compose، وقاعدة البيانات على Supabase (PostgreSQL مُدار)**.

## الأوامر الأساسية (ملخص سريع)

```bash
cd /opt/school-system

./setup.sh                                    # أول مرة: معالج يسألك ويولّد .env (يرمّز كلمة مرور Supabase ويبني الرابطين) ثم يكمل الفحص والتشغيل

./deploy.sh                                   # نشر/تحديث كل شيء (git pull ← بناء ← نسخة احتياطية ← migrations ← تحديث متدرّج)
docker compose exec backend python scripts/create_admin.py --email you@school.iq --name "مدير النظام"   # إنشاء المدير
docker compose run --rm --no-deps -e RUN_MIGRATIONS=0 backend python scripts/check_db.py                 # فحص الاتصال بـ Supabase
./scripts/backup.sh                           # نسخة احتياطية الآن       (استعادة: ./scripts/backup.sh restore <ملف>)
./deploy.sh rollback                          # الرجوع لصور النسخة السابقة
docker compose ps && docker compose logs -f --tail=100 backend      # الحالة والسجلات
```

## 1. نظرة عامة على المعمارية

```
                                         ┌───────────────────── VPS (Docker Compose) ─────────────────────┐
الإنترنت ──443/80──▶ nginx-proxy ──┬────▶│ frontend  (Nginx يقدّم ملفات React، 2 نسخة)                      │
                    (TLS، ترويسات   │     │ backend   (gunicorn + Uvicorn، 2 نسخة) ──TLS──┐                  │
                     الأمان، حدود   └────▶│                                                │                  │
                     الطلبات)             └────────────────────────────────────────────────┼──────────────────┘
                                                                                           ▼
                                                              Supabase (PostgreSQL مُدار، SSL إلزامي)
                                                              ├─ Transaction pooler :6543  ← التطبيق (DATABASE_URL)
                                                              └─ Session pooler     :5432  ← الـ migrations (MIGRATION_DATABASE_URL)
```

- **ثلاث خدمات فقط** تعمل على الخادم: `backend` و`frontend` و`nginx-proxy` (توفير للذاكرة والمعالج). قاعدة البيانات خارجية على Supabase.
- المنفذان **80 و443 فقط** منشوران للخارج. الـ backend يعمل بمستخدم غير جذر (uid 10001) بنظام ملفات للقراءة فقط وبلا صلاحيات Linux إضافية.
- كل تحديث بـ `./deploy.sh` بلا توقف ملحوظ (القسم 11).
- بديل اختياري: قاعدة PostgreSQL محلية في Docker (`COMPOSE_PROFILES=localdb`) — انظر القسم 16.

## 2. المتطلبات

| البند | الحد الأدنى الموصى به |
|---|---|
| الخادم | VPS بـ 1–2 vCPU و2 GB ذاكرة و20 GB قرص (القاعدة خارجية فلا تحتاج موارد لها) |
| النظام | Ubuntu 22.04 أو 24.04 (أو Debian 12) |
| النطاق | نطاق/نطاق فرعي (مثل `school.example.com`) تتحكم بسجلات DNS الخاص به |
| قاعدة البيانات | حساب [Supabase](https://supabase.com) ومشروع جديد (انظر القسم 6) |
| المنافذ | 22 (SSH)، 80، 443 مفتوحة |

## 3. تهيئة VPS جديد

اتصل كـ root أول مرة (`ssh root@IP`) ثم نفّذ:

```bash
# 3.1 تحديث النظام
apt update && apt -y upgrade && apt -y install ufw fail2ban unattended-upgrades curl git openssl

# 3.2 مستخدم إداري غير جذر
adduser deploy                      # اختر كلمة مرور قوية
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy   # ينسخ مفتاح SSH الحالي

# 3.3 تأمين SSH: بمفاتيح فقط وبلا دخول root  (تأكد أولًا أن الدخول بمستخدم deploy يعمل في نافذة أخرى!)
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# 3.4 الجدار الناري: SSH و HTTP و HTTPS فقط
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

# 3.5 حماية من تخمين SSH + تحديثات أمنية تلقائية
systemctl enable --now fail2ban
dpkg-reconfigure -plow unattended-upgrades

# 3.6 (اختياري، للخوادم بذاكرة 2GB أو أقل) ذاكرة مبادلة 2GB
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

> ⚠️ Docker يتجاوز قواعد `ufw` للمنافذ المنشورة. لا مشكلة هنا لأن المنافذ المنشورة هي 80/443 فقط (مقصودة)، ولا ننشر أي منفذ آخر.

## 4. تثبيت Docker

اتبع [التوثيق الرسمي](https://docs.docker.com/engine/install/ubuntu/) أو الأوامر التالية (Ubuntu):

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update && sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy      # ثم اخرج وادخل من جديد
docker compose version              # يجب أن يظهر الإصدار 2.x
```

## 5. النطاق (DNS)

أنشئ سجل **A** يشير النطاق إلى عنوان IP للخادم، وانتظر انتشاره (`dig +short school.example.com` يعيد IP الخادم).
لا تُكمل قبل ذلك: Let's Encrypt يتحقق من النطاق عبر المنفذ 80.

## 6. إعداد Supabase (قاعدة البيانات)

### 6.1 إنشاء المشروع

1. سجّل في [supabase.com](https://supabase.com) وفعّل **المصادقة الثنائية (MFA)** على حسابك (من يملك الحساب يملك بيانات المدرسة).
2. **New project** ← اختر المنظمة ← اسم المشروع (مثل `school-sis`).
3. **Database Password**: اضغط *Generate a password* أو ضع كلمة مرور قوية. الأفضل **حروف وأرقام فقط** (مثل ناتج `openssl rand -hex 24`) فلا تحتاج ترميزًا. **احفظها فورًا** في مدير كلمات مرور (نسيانها ليس كارثة: *Project Settings ← Database ← Reset database password*).
4. **Region**: الأقرب جغرافيًا لخادم الـ VPS (يقلّل زمن الاستجابة). **سجّل المنطقة** فهي جزء من عنوان المجمّع.
5. انتظر دقيقة حتى يصبح المشروع جاهزًا.

> 💡 **اختيار الخطة:** هذه بيانات مالية وأكاديمية حقيقية. الخطة المجانية تُوقف المشروع عند خمول طويل وقد لا تتضمن نسخًا احتياطية يومية؛ خطط الإنتاج تضيف نسخًا يومية/استعادة لنقطة زمنية وحدودًا أعلى. راجع [الأسعار والحدود الحالية](https://supabase.com/pricing) واختر ما يناسب، ولا تعتمد على نسخ Supabase وحدها (القسم 12).

### 6.2 استخراج روابط الاتصال (Connection String)

1. افتح مشروعك ← اضغط زر **Connect** في أعلى لوحة المشروع (في بعض الواجهات القديمة: *Project Settings ← Database ← Connection string*).
2. تبويب **Connection String** ← النوع (Type) **URI**.
3. انسخ رابطين بتغيير **Method**:

| Method في اللوحة | شكل الرابط | أين تضعه في `.env` | لماذا |
|---|---|---|---|
| **Transaction pooler** | `postgresql://postgres.<REF>:[YOUR-PASSWORD]@aws-0-<REGION>.pooler.supabase.com:6543/postgres` | `DATABASE_URL` | تشغيل التطبيق: يدعم اتصالات كثيرة قصيرة العمر |
| **Session pooler** | `postgresql://postgres.<REF>:[YOUR-PASSWORD]@aws-0-<REGION>.pooler.supabase.com:5432/postgres` | `MIGRATION_DATABASE_URL` | الـ migrations والنسخ الاحتياطي (تحتاج جلسة ثابتة وأقفالًا) |
| Direct connection | `postgresql://postgres:[YOUR-PASSWORD]@db.<REF>.supabase.co:5432/postgres` | **لا تستخدمه** على VPS عادي | عنوانه **IPv6 فقط** وDocker لا يدعم IPv6 افتراضيًا ⇒ `Network is unreachable` (إلا مع IPv4 add-on أو VPS/Docker مضبوطين لـ IPv6) |

- `<REF>` معرّف مشروعك (20 حرفًا)، و`<REGION>` منطقتك (مثل `eu-central-1`)، وقد تكون البادئة `aws-0` أو `aws-1` — انسخ الرابط كما تعرضه اللوحة ولا تكتبه يدويًا.
- لاحظ اسم المستخدم مع المجمّع: **`postgres.<REF>`** وليس `postgres` فقط.

### 6.3 ترميز كلمة المرور (URL-encoding)

اللوحة تعرض `[YOUR-PASSWORD]` مكان كلمة المرور؛ استبدلها بكلمة مرورك. إن كانت تحوي رموزًا خاصة (`@ : / ? # % $ &` ...) فلا بد من ترميزها وإلا يفشل الاتصال أو يتصل بمضيف خاطئ. أمر جاهز يطلب كلمة المرور بلا إظهارها:

```bash
python3 -c "import urllib.parse,getpass; print(urllib.parse.quote(getpass.getpass('password: '), safe=''))"
```

مثال: كلمة المرور `p@ss:w/rd#1` تصبح `p%40ss%3Aw%2Frd%231`. (كلمة هيكس بلا رموز لا تحتاج ترميزًا.)

### 6.4 ما يفعله النظام تلقائيًا بالرابط

- يحوّل `postgresql://` و`postgres://` إلى مشغّل `postgresql+psycopg://` (لا تعدّل البادئة بنفسك).
- يضيف `sslmode=require` لأي مضيف `supabase.co/.com`، **ويرفض** `sslmode=disable|allow|prefer` (لا اتصال غير مشفّر).
- يحذف معاملات غير مقبولة في libpq تظهر في بعض الأمثلة (`pgbouncer=true`, `connection_limit`).
- مع المنفذ **6543** يعطّل الـ prepared statements تلقائيًا (Supavisor/PgBouncer في وضع المعاملات لا يدعمها بموثوقية).
- الـ migrations تُرفض إن وُجّهت للمنفذ 6543؛ في الإنتاج يرفض الخادم الإقلاع إن كان `DATABASE_URL` على 6543 دون `MIGRATION_DATABASE_URL`.

### 6.5 تحصين Supabase (مهم)

- **واجهة REST العامة (Data API):** Supabase يكشف جداول `public` عبر REST بمفتاح `anon` العام، ويمنح دوري `anon/authenticated` صلاحيات افتراضية على أي جدول جديد. تطبيقنا **لا يستخدم** هذه الواجهة. لذا، **عند كل نشر** يفعّل `migrate.py` تلقائيًا *Row Level Security* على كل جدول بلا سياسات ويسحب صلاحيات الدورين (ويمنعها عن الجداول المستقبلية). طبقة إضافية يدوية: *Project Settings ← API* ← عطّل **Data API** إن لم تكن بحاجته.
- **فرض SSL:** *Project Settings ← Database ← SSL Configuration* ← فعّل **Enforce SSL on incoming connections**.
- **تقييد الشبكة:** *Project Settings ← Database ← Network Restrictions* (إن توفرت في خطتك) ← اسمح بعنوان IP الخاص بالـ VPS فقط.
- **المفاتيح:** لا تضع `anon` ولا `service_role` في أي مكان؛ التطبيق لا يحتاجها. لا تشارك كلمة مرور القاعدة.
- **حدود الاتصالات:** مجموع اتصالات التطبيق = `BACKEND_REPLICAS × WEB_CONCURRENCY × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` = `2×2×5 = 20` افتراضيًا. اجعله أقل بوضوح من حد خطتك (راجع *Database ← Connection pooling*)، وخفّض `DB_POOL_SIZE` عند الحاجة.

### 6.6 اختبار الاتصال قبل أي نشر

بعد ضبط `.env` (القسم 7):

```bash
docker compose run --rm --no-deps -e RUN_MIGRATIONS=0 backend python scripts/check_db.py
```

يعرض نوع الاتصال (مجمّع معاملات/Session/مباشر)، تفعيل SSL، المستخدم، نسخة المخطط، ويقترح حلولًا لأشهر الأخطاء (`Network is unreachable`, `Tenant or user not found`, `password authentication failed`).

## 7. جلب الكود وضبط البيئة

```bash
sudo mkdir -p /opt/school-system && sudo chown deploy:deploy /opt/school-system
git clone <رابط-المستودع> /opt/school-system && cd /opt/school-system
git checkout main                           # أو الفرع الذي تنشره

cp .env.production.example .env
chmod 600 .env
echo "SECRET_KEY=$(openssl rand -hex 32)"   # ولّد المفتاح ثم الصقه في .env
nano .env
```

القيم التي يجب تعديلها: `DOMAIN` و`LETSENCRYPT_EMAIL` و`SECRET_KEY` و`DATABASE_URL` و`MIGRATION_DATABASE_URL`. **ضع روابط Supabase بين علامتي اقتباس مفردتين**:

```env
DATABASE_URL='postgresql://postgres.abcdefghijklmnopqrst:ENCODED_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require'
MIGRATION_DATABASE_URL='postgresql://postgres.abcdefghijklmnopqrst:ENCODED_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require'
```

- **`SECRET_KEY`**: الخادم **يرفض الإقلاع** في الإنتاج إن كان افتراضيًا أو ضعيفًا أو أقصر من 32 حرفًا. احفظه في مدير كلمات مرور؛ تغييره يُسجّل خروج الجميع ويُبطل رموز QR للسندات القديمة.
- لا ترفع `.env` إلى Git (مستثنى في `.gitignore`).

## 8. أول تشغيل وشهادة SSL (Let's Encrypt)

```bash
# اختياري لكن مستحسن: تجربة على بيئة Let's Encrypt التجريبية (لا تستهلك حدود الإصدار)
STAGING=1 ./deploy/init-letsencrypt.sh
rm -rf deploy/certbot/conf/*           # امسح شهادة التجربة ثم أصدر الحقيقية
./deploy/init-letsencrypt.sh
```

ماذا يفعل: يُنشئ شهادة مؤقتة كي يقلع Nginx ← يبني ويشغّل الخدمات (الـ backend ينفّذ الـ migrations على Supabase تلقائيًا عند إقلاعه) ← يطلب الشهادة الحقيقية عبر HTTP-01 ← يعيد تحميل Nginx. إن فشل الطلب يُعيد الشهادة المؤقتة ويخبرك بالسبب (غالبًا DNS أو المنفذ 80).

**التجديد التلقائي** (الشهادة صالحة 90 يومًا):

```bash
crontab -e
17 3 * * * cd /opt/school-system && ./deploy/renew-certs.sh >> backups/renew.log 2>&1
```

## 9. إنشاء المدير الأول

التسجيل المفتوح لأول مستخدم **معطّل** في الإنتاج (`ALLOW_BOOTSTRAP_REGISTRATION=false`) حتى لا يسبقك أحد لإنشاء حساب مدير:

```bash
docker compose exec backend python scripts/create_admin.py --email you@school.iq --name "مدير النظام"
# تُطلب كلمة المرور مرتين (12 حرفًا على الأقل)
```

بعدها أنشئ بقية الحسابات (محاسب، معلمون، أولياء أمور) من صفحة «المستخدمون» داخل النظام.

## 10. التحقق من سلامة التركيب

```bash
docker compose ps                                  # ثلاث خدمات: backend (×2) و frontend (×2) و nginx-proxy — كلها healthy
curl -fsS https://school.example.com/api/v1/health # {"status":"ok"}  (يتحقق من الوصول لـ Supabase فعلًا)
curl -sI https://school.example.com | grep -iE "strict-transport|content-security|x-frame"
curl -sI http://school.example.com | head -2       # 301 إلى https
curl -s -o /dev/null -w "%{http_code}\n" https://school.example.com/docs   # 404 (التوثيق معطّل)
```

وافحص التصنيف الأمني للنطاق عبر [SSL Labs](https://www.ssllabs.com/ssltest/) (المتوقع A/A+) و[securityheaders.com](https://securityheaders.com).

## 11. التحديث (نشر نسخة جديدة)

```bash
cd /opt/school-system && ./deploy.sh
```

ما يفعله بالترتيب:

1. فحص `.env` (يرفض الأسرار الافتراضية والروابط النموذجية).
2. `git pull --ff-only` (تخطَّه بـ `--no-pull`).
3. حفظ الصور الحالية بوسم `:previous` للرجوع السريع.
4. `docker compose build` للـ backend والواجهة.
5. **فحص الاتصال بـ Supabase** (`check_db.py`): SSL والمجمّع والصلاحيات — يتوقف مبكرًا برسالة واضحة إن فشل.
6. **نسخة احتياطية** من مخطط `public` (تخطَّها بـ `--skip-backup`).
7. **الـ migrations** (`alembic upgrade head`) بحاوية مؤقتة بالصورة الجديدة عبر `MIGRATION_DATABASE_URL`، تحت قفل PostgreSQL يمنع التسابق، ثم تحصين المخطط (RLS).
8. **استبدال متدرّج**: تُنشأ نسخة جديدة بجانب القديمة وتُنتظر حتى تصبح `healthy` ثم تُوقَف القديمة بإمهال لإنهاء طلباتها. (اختُبر: ~1000 طلب أثناء نشر كامل بلا فشل.)
9. إعادة توليد إعداد Nginx وتحميله بلا إسقاط اتصالات، ثم فحص الصحة وفحص HTTPS خارجي.

**قاعدة ذهبية للـ migrations:** أثناء الاستبدال تعمل النسختان القديمة والجديدة معًا على القاعدة المحدَّثة، فاجعل كل migration **إضافيًا ومتوافقًا مع الكود القديم** (أضف أعمدة/جداول؛ لا تحذف ولا تُعد تسمية في الإصدار نفسه).

**الرجوع لنسخة سابقة:**

```bash
./deploy.sh rollback       # يعيد صور الـ backend/الواجهة السابقة؛ لا يعكس migrations
./scripts/backup.sh restore backups/<ملف>.sql.gz   # لاستعادة البيانات أيضًا إن لزم
```

## 12. النسخ الاحتياطي والاستعادة

```bash
./scripts/backup.sh        # نسخة مضغوطة في backups/ (آخر BACKUP_KEEP نسخة، 14 افتراضيًا)
```

مع Supabase يُنفَّذ `pg_dump` من حاوية `postgres` مؤقتة (`PG_CLIENT_IMAGE`) على مخطط `public` فقط (مخططات Supabase الداخلية لا تُمسّ) عبر `MIGRATION_DATABASE_URL`.
**اضبط `PG_CLIENT_IMAGE` على إصدار يساوي أو يفوق إصدار PostgreSQL في مشروعك** (*Project Settings ← Infrastructure*؛ الافتراضي `postgres:17-alpine`)، وإلا يرفض `pg_dump` العمل.

**جدولة يومية** (3:30 صباحًا):

```bash
crontab -e
30 3 * * * cd /opt/school-system && ./scripts/backup.sh >> backups/backup.log 2>&1
```

**نسخة خارج الخادم (ضرورية!):**

```bash
rsync -az --delete -e ssh backups/ backup-user@other-server:/srv/school-sis-backups/
# أو إلى تخزين سحابي عبر rclone (بعد rclone config)
rclone sync backups/ remote:school-sis-backups
```

وفّر كذلك نسخ Supabase نفسها إن كانت خطتك تتضمنها (يومية/نقطة زمنية) كطبقة ثانية مستقلة عن نسخ الخادم.

**الاستعادة** (تستبدل جداول التطبيق الحالية — تطلب تأكيدًا صريحًا `YES`، ولا تحذف قاعدة Supabase نفسها):

```bash
./scripts/backup.sh restore backups/school-sis-2026-10-06T0330.sql.gz
```

**جرّب الاستعادة** على مشروع Supabase تجريبي مرة كل فترة. واحفظ `.env` (يحوي `SECRET_KEY`) بشكل آمن ومنفصل؛ بدونه لا تصلح رموز QR القديمة للسندات.

## 13. المراقبة والسجلات

```bash
docker compose ps                         # الحالة والصحة
docker compose logs -f --tail=100 backend # سجل الخادم (وكذلك: nginx-proxy, frontend)
docker stats --no-stream                  # استهلاك الذاكرة/المعالج
df -h && docker system df                 # المساحة
```

- تدوير السجلات مضبوط (10MB × 5 ملفات لكل حاوية).
- لوحة Supabase: *Reports / Logs* لاستهلاك القاعدة والاتصالات والاستعلامات البطيئة.
- ضع مراقبة خارجية (UptimeRobot مثلًا) على `https://DOMAIN/api/v1/health` مع تنبيه بالبريد؛ هذا المسار يفشل (503) إن تعذّر الوصول لـ Supabase.
- سندات القبض ثابتة بـ Triggers: لا يقبل تعديلها أو حذفها حتى بأوامر SQL مباشرة (من SQL Editor مثلًا)، إلا أن يعطّل مالك القاعدة الـ Trigger عمدًا.

## 14. ما يفرضه الإعداد من حماية

| الطبقة | الإجراء |
|---|---|
| إقلاع الـ backend | يرفض الإقلاع في الإنتاج إن كان `SECRET_KEY` افتراضيًا/ضعيفًا/<32 حرفًا، أو CORS يحوي `*`، أو الـ migrations موجَّهة لمجمّع المعاملات |
| قاعدة البيانات | اتصال مشفّر إلزامي مع Supabase، RLS على كل الجداول وسحب صلاحيات `anon/authenticated` تلقائيًا في كل نشر |
| التوثيق | `/docs` و`/openapi.json` معطّلان في الإنتاج (وحجب ثانٍ في Nginx) |
| الحسابات | لا تسجيل عام؛ أول مدير بـ `create_admin.py`، وإنشاء الحسابات للمدير فقط |
| Nginx | HTTPS فقط (TLS 1.2/1.3)، HSTS، `X-Frame-Options`، `X-Content-Type-Options`، `Referrer-Policy`، `Permissions-Policy`، `Content-Security-Policy` صارمة |
| الطلبات | تسجيل الدخول 5/دقيقة لكل IP، بقية الـ API 20/ثانية، الواجهة 40/ثانية، حدّ اتصالات متزامنة، حجم جسم 10MB، مهل قصيرة |
| الهجمات الأساسية | حجب الملفات المخفية (`.env`, `.git`)، مسارات المسح الشائعة، الطرق غير المعتمدة، وإسقاط الطلبات لمضيف غير النطاق |
| الحاويات | مستخدم غير جذر، نظام ملفات للقراءة فقط، `cap_drop: ALL`، `no-new-privileges` |
| البيانات المالية | سندات القبض ثابتة (ORM + Triggers) والتصحيح بسند عكس فقط |

**مراجعة دورية:** حدّث الصور (`./deploy.sh` يستخدم `--pull`)، حدّث النظام (`apt upgrade`)، راجع `docker compose logs nginx-proxy | grep " 429 "` لمحاولات الإغراق، وغيّر كلمات المرور (النظام وSupabase) عند خروج أي موظف له صلاحيات.

## 15. استكشاف الأخطاء

| العَرَض | السبب المحتمل / الحل |
|---|---|
| `DATABASE_URL مطلوب` عند `docker compose` | لم يُضبط في `.env`، أو `.env` ليس في مجلد المشروع |
| `Network is unreachable` | استخدمت الرابط المباشر `db.<ref>.supabase.co` (IPv6). استخدم Session/Transaction pooler (القسم 6.2) |
| `Tenant or user not found` | اسم المستخدم يجب أن يكون `postgres.<REF>` مع المجمّع، والمنطقة (`aws-0-<REGION>`) يجب أن تطابق مشروعك تمامًا — انسخ الرابط من اللوحة |
| `password authentication failed` | كلمة المرور خطأ أو غير مرمَّزة (القسم 6.3)، أو أعيد ضبطها في Supabase دون تحديث `.env` |
| رابط يُقرأ بمضيف غريب أو «invalid URL» | `@` أو رمز خاص غير مرمَّز في كلمة المرور؛ رمّزها. وتأكد من الاقتباس المفرد حول الرابط في `.env` |
| `رُفض الإقلاع` في سجل الـ backend | `SECRET_KEY` ضعيف، أو `DATABASE_URL` على 6543 دون `MIGRATION_DATABASE_URL`، أو الـ migration على 6543 |
| `prepared statement ... does not exist` | تشغيل عبر مجمّع المعاملات مع تعطيل الكشف التلقائي؛ اترك `DB_DISABLE_PREPARED_STATEMENTS` فارغًا أو اضبطه `true` |
| `remaining connection slots are reserved` / مهلة اتصال | اتصالات أكثر من حد خطتك؛ خفّض `DB_POOL_SIZE` و`BACKEND_REPLICAS` و`WEB_CONCURRENCY` |
| المشروع لا يستجيب (الخطة المجانية) | قد يكون Supabase أوقف المشروع لخمول؛ استأنفه من اللوحة (ولهذا لا تُنصح الخطة المجانية للإنتاج) |
| `pg_dump: server version mismatch` | اضبط `PG_CLIENT_IMAGE` على إصدار PostgreSQL مساوٍ أو أحدث (القسم 12) |
| فشل `init-letsencrypt.sh` | DNS لا يشير للخادم، أو المنفذ 80 مغلق، أو تجاوزت حدود Let's Encrypt (جرّب `STAGING=1`) |
| 502 من الموقع | الـ backend لم يصبح healthy (`docker compose logs backend`)، غالبًا مشكلة اتصال بـ Supabase — شغّل `check_db.py` |
| 429 للمستخدمين الشرعيين | تسجيل الدخول المتكرر من IP واحد (مدرسة خلف NAT)؛ عدّل `rate=5r/m` في `deploy/nginx/templates/default.conf.template` ثم `./deploy.sh` |
| فشل migration عند النشر | الحاوية المؤقتة تطبع الخطأ؛ الخدمات القديمة تبقى تعمل. أصلح ثم أعد `./deploy.sh` أو استعد النسخة المأخوذة قبله |

## 16. بديل: قاعدة PostgreSQL محلية بدل Supabase

للتجارب أو الاستضافة الذاتية الكاملة (تستهلك ذاكرة إضافية على الخادم). في `.env`:

```env
COMPOSE_PROFILES=localdb
POSTGRES_DB=school_sis
POSTGRES_USER=school
POSTGRES_PASSWORD=<openssl rand -hex 24>
DATABASE_URL='postgresql://school:<نفس-كلمة-المرور>@db:5432/school_sis'
MIGRATION_DATABASE_URL=''
```

ثم `./deploy.sh` كالمعتاد: تُشغَّل خدمة `db` (حجم دائم `pgdata`، `healthcheck`) ويؤخذ النسخ الاحتياطي منها. الرجوع إلى Supabase بإزالة `COMPOSE_PROFILES` ووضع روابطه (انقل البيانات بـ `backup.sh` ثم `restore`).

## 17. ما اختُبر فعليًا وما لم يُختبر

اختُبر على Docker حقيقي: بناء الصور، الـ migrations كاملة على PostgreSQL 16، اختبارات الـ backend كلها على PostgreSQL، تدفق المالية كاملًا عبر Nginx، رفض الإقلاع بمفتاح ضعيف، المستخدمون غير الجذر، ترويسات الأمان وCSP على واجهة حقيقية، Rate Limiting، النشر المتدرّج بلا فشل طلبات، النسخ والاستعادة، والرجوع.

**اختبار Supabase تم على محاكاة** مطابقة للمواصفات: PostgreSQL يرفض أي اتصال غير مشفّر + PgBouncer في وضع المعاملات على 6543 + اتصال مباشر مشفّر على 5432، مع مستخدم باسم نقطي (`postgres.<ref>`) وكلمة مرور برموز خاصة مرمَّزة وأدوار `anon/authenticated` بصلاحياتها الافتراضية. ثبت: الاتصال والـ migrations والـ RLS وسحب الصلاحيات (anon يُمنع من القراءة، والجداول المستقبلية محمية)، ونشر كامل بلا فشل، ونسخ/استعادة عن بعد.

**لم يُختبر هنا** (يحتاج حسابك الحقيقي): الاتصال بسحابة Supabase نفسها (لا وصول لها من بيئة الاختبار) — لذلك شغّل `check_db.py` أولًا (القسم 6.6) — والإصدار الفعلي لشهادة Let's Encrypt وتجديدها. ولم أستطع إعادة إنتاج عطل الـ prepared statements محليًا مع PgBouncer الحديث، فالتعطيل التلقائي مع 6543 يتبع إرشادات Supabase (احتياط آمن بلا كلفة تُذكر).
