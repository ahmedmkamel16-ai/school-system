# School SIS — نظام إدارة مدرسة

نظام إدارة مدرسة (Student Information System) مكوّن من واجهة أمامية بلغة React وواجهة خلفية بإطار FastAPI.

## الميزات الحالية

### الحسابات والصلاحيات
- تسجيل دخول محمي بـ JWT، وتسجيل حسابات جديدة مقصور على المدير أو من يفوّضه (بلا تسجيل ذاتي مفتوح).
- أربعة أدوار: **مدير** (كل الصلاحيات)، **معلم** (يرى فقط طلابه وفصله)، **محاسب** (قراءة فقط)، **ولي أمر** (يرى فقط أبناءه).
- صفحة "المستخدمون": إضافة/تعديل حسابات، إعادة تعيين كلمة المرور، توليد كلمة مرور عشوائية آمنة.
- صفحة "سجل النشاطات" (Audit Log): تسجيل كل عملية إضافة/تعديل/حذف مع اسم من قام بها والتاريخ.

### الطلاب
- جدول بفلاتر متتالية (الصف ثم الشعب التابعة له فقط)، بحث، فلتر الحالة (نشط/مستمع/معلق/منقول)، وزر إعادة ضبط الفلاتر.
- عداد إحصائي سريع: إجمالي الطلاب، الحاضرون اليوم، الطلاب الجدد هذا الشهر.
- تحديد متعدد (Checkboxes) لنقل عدة طلاب دفعة واحدة إلى صف/شعبة أخرى.
- ترقيم صفحات (10/25/50)، تصدير/استيراد Excel.
- لكل طالب: تسجيل حضور يومي + زر واتساب مباشر لتنبيه ولي الأمر عند الغياب/التأخر، عرض ملف شخصي كامل (لوحة منزلقة) مع سجل الحضور، وطباعة بطاقة تعريف.
- **المعلمون والفصول الدراسية (الشعب)**: عرض/إضافة/تعديل/حذف مع فلاتر بحث.

### تجربة الاستخدام
- الوضع الداكن (Dark Mode) مع حفظ التفضيل.
- شريط جانبي قابل للتصغير للأيقونات فقط.
- بحث شامل سريع (Ctrl+K) للتنقل بين الصفحات والطلاب والمعلمين.
- إشعارات نجاح/خطأ (Toast) لكل عملية.

**غير مكتمل بعد (بقرار مؤجَّل حاليًا)**: النظام المالي والأقساط، كشف الدرجات والمواد الدراسية، جداول الحصص، ونشر المشروع على سيرفر حقيقي.

## ملاحظة عن الشبكة أثناء التطوير المحلي

استخدم دائمًا `http://127.0.0.1:5173` و`http://127.0.0.1:8000` بدل `localhost` عند التطوير على ويندوز في هذه البيئة. لاحظنا أن بعض الخدمات (Vite أو Uvicorn) قد ترتبط بعنوان IPv4 (`127.0.0.1`) بينما يحاول المتصفح الوصول عبر IPv6 (`::1`) عند استخدام `localhost`، مما يسبب "Connection Refused" رغم أن الخادم يعمل فعليًا. الإعدادات الحالية في `vite.config.ts` و`VITE_API_URL` و`CORS_ORIGINS` مضبوطة على `127.0.0.1` لتفادي هذا الالتباس.

## هيكل المشروع

```
school-sis/
├── frontend/                  # تطبيق React (Vite) بواجهة عربية RTL
│   ├── src/
│   │   ├── api/                # عملاء الاتصال بالـ API (axios) وخطافات TanStack Query
│   │   │   ├── client.ts       # نسخة axios تضيف تلقائيًا رمز JWT لكل طلب
│   │   │   ├── students.ts     # useStudents (مع فلاتر)، useCreate/Update/DeleteStudent
│   │   │   ├── teachers.ts     # useTeachers، useCreateTeacher
│   │   │   └── classrooms.ts   # useClassrooms، useCreateClassroom
│   │   ├── components/
│   │   │   ├── ui/              # مكوّنات shadcn/ui (Button, Dialog, Select, AlertDialog, Sonner...)
│   │   │   ├── students/        # StudentFormDialog (إضافة/تعديل)، DeleteStudentDialog
│   │   │   ├── teachers/        # TeacherFormDialog
│   │   │   └── classes/         # ClassroomFormDialog
│   │   ├── hooks/               # خطافات مساعدة (use-mobile من shadcn)
│   │   ├── layouts/
│   │   │   └── AppLayout.tsx   # القالب العام: شريط جانبي (Sidebar) + رأس الصفحة
│   │   ├── lib/
│   │   │   ├── auth.tsx        # AuthProvider/useAuth لإدارة جلسة JWT في localStorage
│   │   │   ├── constants.ts    # قائمة الصفوف الدراسية (GRADE_LEVELS)
│   │   │   └── utils.ts        # دالة cn() لدمج أصناف Tailwind
│   │   ├── pages/               # لوحة التحكم، الطلاب (بحث/فلاتر/إضافة/تعديل/حذف)، المعلمون، الفصول، الدخول
│   │   ├── App.tsx              # تعريف المسارات (react-router-dom) وحماية المسارات
│   │   ├── main.tsx             # نقطة الدخول: QueryClientProvider + BrowserRouter + AuthProvider
│   │   └── index.css            # إعداد Tailwind v4 + متغيرات ألوان shadcn + اتجاه RTL
│   ├── components.json          # إعداد shadcn/ui CLI (المسارات، النمط، المكتبة الأساسية)
│   ├── scripts/shadcn-add.mjs   # غلاف حول أمر shadcn add (انظر الملاحظة أدناه)
│   ├── vite.config.ts           # إعداد Vite + مكوّن @tailwindcss/vite + مسار الاستيراد "@/"
│   └── package.json
│
├── backend/                    # تطبيق FastAPI
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py       # إعدادات التطبيق عبر pydantic-settings (.env)
│   │   │   ├── database.py     # محرك SQLModel/SQLAlchemy وجلسة قاعدة البيانات
│   │   │   ├── security.py     # تجزئة كلمات المرور (bcrypt) وإصدار/فك رموز JWT (python-jose)
│   │   │   └── deps.py         # الاعتماديات المشتركة: SessionDep و CurrentUser (حماية JWT)
│   │   ├── models/              # نماذج SQLModel (الجداول): User, Student, Teacher, ClassRoom
│   │   ├── schemas/             # مخططات Pydantic لطلبات/استجابات API (Create/Update/Read)
│   │   ├── routers/             # نقاط النهاية: auth (تسجيل/دخول/me)، students، teachers، classes
│   │   └── main.py              # إنشاء تطبيق FastAPI، إعداد CORS، تضمين الراوترات
│   ├── alembic/                 # إدارة تحديثات قاعدة البيانات (migrations)
│   │   ├── env.py               # مهيّأ لاستخدام SQLModel.metadata و DATABASE_URL من الإعدادات
│   │   └── versions/            # ملفات الترحيل (migrations) المولّدة
│   ├── alembic.ini
│   ├── requirements.txt
│   └── .env.example
│
└── README.md
```

## المكتبات المستخدمة

### الواجهة الأمامية (frontend)
- **React 19 + Vite** — بيئة تطوير سريعة وبناء للإنتاج.
- **Tailwind CSS v4** (عبر `@tailwindcss/vite`) — تنسيق الواجهة، مع دعم اتجاه **RTL** مفعّل افتراضيًا (`dir="rtl"` في `index.html` و`html { direction: rtl }` في `index.css`) وخط عربي (Tajawal) مضمّن محليًا عبر `@fontsource`.
- **shadcn/ui** — مكوّنات واجهة قابلة للتخصيص (Button, Card, Table, Sidebar, ...) تُدار عبر `components.json`. لإضافة مكوّن جديد استخدم:
  ```bash
  npm run shadcn:add -- <component>
  ```
  **لماذا لا نستخدم `npx shadcn@latest add` مباشرة؟** في نسخة الأداة الحالية (4.18.0) على ويندوز، توجد مشكلة معروفة تجعلها تكتب الملفات الجديدة داخل مجلد حرفي اسمه `@` بدل حلّه إلى `src/` — وهذا يحدث بغض النظر عن مسار المشروع (تم التأكد أنها ليست بسبب المسارات العربية أو المسافات). سكربت `scripts/shadcn-add.mjs` يشغّل الأداة الأصلية ثم ينقل الملفات تلقائيًا لمكانها الصحيح، فتبقى هذه المشكلة محلولة بشكل دائم طالما استُخدم هذا الأمر.
- **TanStack Query** — جلب البيانات والتخزين المؤقت (انظر `src/api/students.ts`).
- **react-router-dom** — التوجيه بين الصفحات وحماية المسارات المسجَّل دخولها فقط.
- **axios** — عميل HTTP مع اعتراض تلقائي لإضافة رمز JWT وإزالته عند انتهاء الصلاحية (401).

### الواجهة الخلفية (backend)
- **FastAPI** — إطار العمل الرئيسي لبناء الـ API.
- **SQLModel** — تعريف النماذج/الجداول (يجمع بين SQLAlchemy وPydantic).
- **Alembic** — إدارة تحديثات قاعدة البيانات (migrations)، مهيّأ لقراءة النماذج تلقائيًا (`autogenerate`).
- **python-jose** — إصدار والتحقق من رموز JWT لتسجيل الدخول والمسارات المحمية.
- **passlib[bcrypt]** — تجزئة كلمات المرور بأمان.
- **SQLite** افتراضيًا للتطوير (`DATABASE_URL` قابل للتغيير إلى PostgreSQL وغيرها في `.env`).

## التشغيل محليًا

### الواجهة الخلفية (backend)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # على ويندوز
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
fastapi dev app/main.py --port 8000
```

سيعمل الخادم على `http://localhost:8000`، وتوثيق API التفاعلي متاح على `http://localhost:8000/docs`.

### الواجهة الأمامية (frontend)

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

سيعمل التطبيق على `http://localhost:5173`.

### إنشاء أول مستخدم

استخدم مسار `/api/v1/auth/register` (من خلال `/docs` أو `curl`) لإنشاء أول حساب مستخدم، ثم سجّل الدخول من صفحة تسجيل الدخول في الواجهة الأمامية.

## إضافة نماذج/جداول جديدة

1. أضف/عدّل نموذج SQLModel في `backend/app/models/`.
2. تأكد من استيراده في `backend/app/models/__init__.py` وفي `backend/alembic/env.py`.
3. ولّد ترحيلًا جديدًا: `alembic revision --autogenerate -m "وصف التغيير"`.
4. راجع الملف المولَّد في `backend/alembic/versions/` ثم طبّقه: `alembic upgrade head`.
