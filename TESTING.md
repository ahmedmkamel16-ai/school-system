# الاختبارات

| الطبقة | الأداة | الأمر | المكان |
|---|---|---|---|
| Backend (API + منطق) | pytest | `cd backend && pip install -r requirements-dev.txt && python -m pytest` | `backend/tests` |
| Frontend (وحدات/مكوّنات) | Vitest + Testing Library | `cd frontend && npm test` | `frontend/src/**/*.test.ts(x)` |
| Frontend (شاملة E2E بمتصفح حقيقي) | Playwright | `cd frontend && npm run test:e2e` | `frontend/e2e` |

## الاختبارات الشاملة (E2E)
- تشغّل خادمًا خاصًا بالاختبار (`backend/scripts/e2e_server.py`، يرفض العمل بدون `E2E_MODE=1`) على قاعدة SQLite مؤقتة
  وبوابات مستقلة (API: 8100، الواجهة: 5174) فلا تتعارض مع بيئة التطوير.
- كل ملف اختبار يعيد بناء القاعدة وبذرها (`POST /__e2e__/reset`، بيانات `backend/scripts/seed_e2e.py`)، فالملفات مستقلة.
- ملفات الاختبار: `grades.spec.ts` (الامتحانات/الدرجات/الشهادة) و`finance.spec.ts` (الرسوم/الدفع/السند/الحجب) و`guardian.spec.ts` (صفحة ولي الأمر والاستثناء).
- أي `console.error` أو خطأ JavaScript في المتصفح يُفشل الاختبار تلقائيًا.
- متغيرات اختيارية: `E2E_PYTHON` (مفسّر بايثون فيه مكتبات الـ backend)، `CHROMIUM_PATH` (متصفح جاهز بدل تنزيل Playwright).
- أول تشغيل على جهاز جديد: `npx playwright install chromium`.

## ملاحظات
- كلمة مرور بيانات الاختبار: `Passw0rd!` (admin@ / acc@ / t@ / t2@ / p1@ / p2@ / p3@ `school.test`).
- فحص أنواع ملفات E2E: `npm run typecheck:e2e`.
