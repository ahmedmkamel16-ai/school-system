# دليل النشر على VPS (Docker + Nginx + PostgreSQL + HTTPS)

دليل خطوة بخطوة لنشر نظام إدارة المدرسة على خادم Linux جديد، من الصفر حتى التحديثات والنسخ الاحتياطي.

## 1. نظرة عامة على المعمارية

```
الإنترنت ──443/80──▶ nginx-proxy ──┬─▶ frontend  (Nginx يقدّم ملفات React، 2 نسخة)
                    (TLS، ترويسات   │
                     الأمان، حدود   └─▶ backend   (gunicorn + Uvicorn، 2 نسخة)
                     الطلبات)                          │
                                                        ▼
                                                    db (PostgreSQL 16، حجم دائم pgdata)
```

- المنفذان **80 و443 فقط** منشوران للخارج، من `nginx-proxy`. قاعدة البيانات والـ backend والواجهة داخل شبكات Docker خاصة.
- شبكة `data` (قاعدة البيانات + backend) معزولة بلا وصول للإنترنت.
- الـ backend يعمل بمستخدم غير جذر (uid 10001) بنظام ملفات للقراءة فقط وبلا صلاحيات Linux إضافية (`cap_drop: ALL`).
- كل تحديث يُنفَّذ بـ `./deploy.sh` ولا يوقف الخدمة (انظر القسم 10).

## 2. المتطلبات

| البند | الحد الأدنى الموصى به |
|---|---|
| الخادم | VPS بـ 2 vCPU و2 GB ذاكرة و20 GB قرص |
| النظام | Ubuntu 22.04 أو 24.04 (أو Debian 12) |
| النطاق | نطاق/نطاق فرعي (مثل `school.example.com`) تتحكم بسجلات DNS الخاص به |
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

## 6. جلب الكود وضبط البيئة

```bash
sudo mkdir -p /opt/school-system && sudo chown deploy:deploy /opt/school-system
git clone <رابط-المستودع> /opt/school-system && cd /opt/school-system
git checkout main                           # أو الفرع الذي تنشره

cp .env.production.example .env
chmod 600 .env
```

ولّد الأسرار وضعها في `.env`:

```bash
echo "SECRET_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
nano .env     # الصق القيمتين واضبط DOMAIN و LETSENCRYPT_EMAIL
```

- **`SECRET_KEY`**: الخادم **يرفض الإقلاع** في الإنتاج إن كان افتراضيًا أو ضعيفًا أو أقصر من 32 حرفًا. احفظه في مدير كلمات مرور؛ تغييره يُسجّل خروج الجميع ويُبطل رموز QR للسندات القديمة.
- **`POSTGRES_PASSWORD`**: استخدم هيكس (`openssl rand -hex`) كي لا تحتاج رموزه ترميزًا داخل رابط الاتصال.
- لا ترفع `.env` إلى Git (مستثنى في `.gitignore`).

## 7. أول تشغيل وشهادة SSL (Let's Encrypt)

```bash
# اختياري لكن مستحسن: تجربة على بيئة Let's Encrypt التجريبية (لا تستهلك حدود الإصدار)
STAGING=1 ./deploy/init-letsencrypt.sh
rm -rf deploy/certbot/conf/*           # امسح شهادة التجربة ثم أصدر الحقيقية
./deploy/init-letsencrypt.sh
```

ماذا يفعل السكربت: يُنشئ شهادة مؤقتة كي يقلع Nginx ← يبني ويشغّل الخدمات (وتُنفَّذ الـ migrations تلقائيًا عند إقلاع الـ backend) ← يطلب الشهادة الحقيقية عبر HTTP-01 ← يعيد تحميل Nginx. إن فشل الطلب يُعيد الشهادة المؤقتة كي لا يتعطل Nginx، ويخبرك بالسبب (غالبًا DNS أو المنفذ 80).

**التجديد التلقائي** (الشهادة صالحة 90 يومًا):

```bash
crontab -e
# أضف:
17 3 * * * cd /opt/school-system && ./deploy/renew-certs.sh >> backups/renew.log 2>&1
```

## 8. إنشاء المدير الأول

التسجيل المفتوح لأول مستخدم **معطّل** في الإنتاج (`ALLOW_BOOTSTRAP_REGISTRATION=false`) حتى لا يسبقك أحد لإنشاء حساب مدير. أنشئ المدير بالأمر:

```bash
docker compose exec backend python scripts/create_admin.py --email you@school.iq --name "مدير النظام"
# تُطلب كلمة المرور مرتين (12 حرفًا على الأقل)
```

بعدها أنشئ بقية الحسابات (محاسب، معلمون، أولياء أمور) من صفحة «المستخدمون» داخل النظام.

## 9. التحقق من سلامة التركيب

```bash
docker compose ps                                  # كل الخدمات healthy
curl -fsS https://school.example.com/api/v1/health # {"status":"ok"}
curl -sI https://school.example.com | grep -iE "strict-transport|content-security|x-frame"
curl -sI http://school.example.com | head -2       # 301 إلى https
curl -s -o /dev/null -w "%{http_code}\n" https://school.example.com/docs   # 404 (التوثيق معطّل)
```

وافحص التصنيف الأمني للنطاق عبر [SSL Labs](https://www.ssllabs.com/ssltest/) (المتوقع A/A+) و[securityheaders.com](https://securityheaders.com).

## 10. التحديث (نشر نسخة جديدة)

```bash
cd /opt/school-system && ./deploy.sh
```

ما يفعله بالترتيب:

1. فحص `.env` (يرفض الأسرار الافتراضية).
2. `git pull --ff-only` (تخطَّه بـ `--no-pull`).
3. حفظ الصور الحالية بوسم `:previous` للرجوع السريع.
4. `docker compose build` للـ backend والواجهة.
5. **نسخة احتياطية** لقاعدة البيانات (تخطَّها بـ `--skip-backup`).
6. **الـ migrations** (`alembic upgrade head`) بحاوية مؤقتة بالصورة الجديدة، تحت قفل PostgreSQL يمنع التسابق.
7. **استبدال متدرّج**: تُنشأ نسخة جديدة بجانب القديمة وتُنتظر حتى تصبح `healthy` ثم تُوقَف القديمة بإمهال لإنهاء طلباتها. بسبب وجود نسختين لكل خدمة وإعادة المحاولة في Nginx لا ينقطع الموقع. (اختُبر: ~1100 طلبًا أثناء نشر كامل بلا فشل.)
8. إعادة توليد إعداد Nginx وتحميله بلا إسقاط اتصالات.
9. فحص الصحة (Nginx ← backend ← PostgreSQL) ثم فحص HTTPS خارجي.

**قاعدة ذهبية للـ migrations:** أثناء الاستبدال تعمل النسختان القديمة والجديدة معًا على القاعدة المحدَّثة. لذا اجعل كل migration **إضافيًا ومتوافقًا مع الكود القديم** (أضف أعمدة/جداول؛ لا تحذف ولا تُعد تسمية في الإصدار نفسه). الحذف يكون في إصدار لاحق بعد أن يتوقف الكود عن استخدامه.

**الرجوع لنسخة سابقة:**

```bash
./deploy.sh rollback       # يعيد صور الـ backend/الواجهة السابقة؛ لا يعكس migrations
./scripts/backup.sh restore backups/<ملف>.sql.gz   # لاستعادة البيانات أيضًا إن لزم
```

## 11. النسخ الاحتياطي والاستعادة

```bash
./scripts/backup.sh        # نسخة مضغوطة في backups/ (يحتفظ بآخر BACKUP_KEEP نسخة، 14 افتراضيًا)
```

**جدولة يومية** (3:30 صباحًا):

```bash
crontab -e
30 3 * * * cd /opt/school-system && ./scripts/backup.sh >> backups/backup.log 2>&1
```

**نسخة خارج الخادم (ضرورية!)** — النسخ المحلية لا تحميك من فقدان الخادم نفسه. انسخ `backups/` دوريًا إلى مكان آخر، مثلًا:

```bash
# إلى خادم آخر
rsync -az --delete -e ssh backups/ backup-user@other-server:/srv/school-sis-backups/
# أو إلى تخزين سحابي عبر rclone (بعد rclone config)
rclone sync backups/ remote:school-sis-backups
```

**الاستعادة** (تستبدل بيانات القاعدة الحالية بالكامل — اطلب تأكيدًا صريحًا `YES`):

```bash
./scripts/backup.sh restore backups/school-sis-2026-10-06T0330.sql.gz
```

**جرّب الاستعادة على خادم/قاعدة تجريبية مرة كل فترة**؛ نسخة لم تُجرَّب استعادتها ليست نسخة مضمونة. تذكّر أيضًا نسخ ملف `.env` (يحوي `SECRET_KEY`) بشكل آمن ومنفصل، فبدونه لا تصلح رموز QR القديمة للسندات.

## 12. المراقبة والسجلات

```bash
docker compose ps                         # الحالة والصحة
docker compose logs -f --tail=100 backend # سجل الخادم (وكذلك: nginx-proxy, db, frontend)
docker stats --no-stream                  # استهلاك الذاكرة/المعالج
df -h && docker system df                 # المساحة
```

- تدوير السجلات مضبوط (10MB × 5 ملفات لكل حاوية) فلا تمتلئ الأقراص.
- ضع مراقبة خارجية (UptimeRobot مثلًا) على `https://DOMAIN/api/v1/health` مع تنبيه بالبريد.
- `docker compose exec db psql -U school school_sis` للاستعلام المباشر عند الحاجة (حذرًا: سندات القبض ثابتة بـ Triggers ولا يقبل تعديلها).

## 13. ما يفرضه الإعداد من حماية

| الطبقة | الإجراء |
|---|---|
| إقلاع الـ backend | يرفض الإقلاع في الإنتاج إن كان `SECRET_KEY` افتراضيًا/ضعيفًا/<32 حرفًا أو كان CORS يحوي `*` |
| التوثيق | `/docs` و`/openapi.json` معطّلان في الإنتاج (وحجب ثانٍ في Nginx) |
| الحسابات | لا تسجيل عام؛ أول مدير بـ `create_admin.py`، وإنشاء الحسابات للمدير فقط |
| Nginx | HTTPS فقط (TLS 1.2/1.3)، HSTS، `X-Frame-Options`، `X-Content-Type-Options`، `Referrer-Policy`، `Permissions-Policy`، `Content-Security-Policy` صارمة (سكربتات `'self'` فقط) |
| الطلبات | تسجيل الدخول 5/دقيقة لكل IP، بقية الـ API 20/ثانية، الواجهة 40/ثانية، حدّ اتصالات متزامنة، حجم جسم 10MB، مهل قصيرة |
| الهجمات الأساسية | حجب الملفات المخفية (`.env`, `.git`)، مسارات المسح الشائعة (`.php`, `wp-login`...)، الطرق غير المعتمدة، وإسقاط الطلبات لمضيف غير النطاق |
| الحاويات | مستخدم غير جذر، نظام ملفات للقراءة فقط، `cap_drop: ALL`، `no-new-privileges` |
| البيانات | قاعدة البيانات بلا منفذ منشور وعلى شبكة بلا إنترنت، سندات القبض ثابتة (ORM + Triggers) |

**مراجعة دورية:** حدّث الصور (`./deploy.sh` يستخدم `--pull`)، حدّث النظام (`apt upgrade`)، راجع `docker compose logs nginx-proxy | grep " 429 "` لمعرفة محاولات الإغراق، وغيّر كلمات مرور المدراء عند خروج أي موظف.

## 14. استكشاف الأخطاء

| العَرَض | السبب المحتمل / الحل |
|---|---|
| الـ backend يعيد التشغيل ويطبع «رُفض الإقلاع» | `SECRET_KEY` ضعيف/غير مضبوط في `.env` |
| `required variable ... is missing` عند `docker compose` | متغير ناقص في `.env` (`DOMAIN`, `SECRET_KEY`, `POSTGRES_PASSWORD`) |
| فشل `init-letsencrypt.sh` | DNS لا يشير للخادم، أو المنفذ 80 مغلق، أو تجاوزت حدود Let's Encrypt (جرّب `STAGING=1`) |
| `nginx-proxy` لا يقلع ويشكو من الشهادة | لا توجد شهادة في `deploy/certbot/conf/live/DOMAIN/`؛ أعد `init-letsencrypt.sh` |
| 502 من الموقع | الـ backend لم يصبح healthy بعد (`docker compose logs backend`)، غالبًا أثناء migrations أو خطأ اتصال بالقاعدة |
| 429 للمستخدمين الشرعيين | تسجيل الدخول المتكرر من نفس IP (مدرسة خلف NAT واحد)؛ ارفع `rate=5r/m` في `deploy/nginx/templates/default.conf.template` ثم `./deploy.sh` |
| فشل migration عند النشر | الحاوية المؤقتة تطبع الخطأ؛ الخدمات القديمة تبقى تعمل. أصلح ثم أعد `./deploy.sh` أو استعد النسخة الاحتياطية المأخوذة قبله |
| الاتصال بالقاعدة يفشل بعد تغيير كلمة المرور | كلمة مرور PostgreSQL تُضبط عند إنشاء الحجم فقط؛ غيّرها داخل القاعدة بـ `ALTER USER` أو أنشئ الحجم من جديد |

## 15. ما اختُبر فعليًا وما لم يُختبر

اختُبر على Docker حقيقي (بناء الصور، PostgreSQL 16، Nginx، شهادة ذاتية التوقيع): الـ migrations كاملة على PostgreSQL، الاختبارات الـ78 للـ backend على PostgreSQL، تدفق المالية كاملًا عبر Nginx (دفع، عكس، تقارير، Excel، حجب الشهادة)، Triggers عدم تعديل السندات على PostgreSQL، رفض الإقلاع بمفتاح ضعيف، المستخدمون غير الجذر ونظام الملفات للقراءة فقط، ترويسات الأمان وCSP على واجهة حقيقية بلا انتهاكات، Rate Limiting، النشر المتدرّج بلا فشل طلبات، النسخ والاستعادة، والرجوع.

**لم يُختبر هنا** (يحتاج خادمك الحقيقي): الإصدار الفعلي لشهادة Let's Encrypt (لا إنترنت لحاوية الاختبار)، وتجديدها التلقائي، والوصول من الإنترنت العام. جرّب `STAGING=1` أولًا كما في القسم 7.
