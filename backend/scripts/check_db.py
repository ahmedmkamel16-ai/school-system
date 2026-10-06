"""فحص الاتصال بقاعدة البيانات (Supabase أو غيرها) وتشخيص المشاكل الشائعة قبل النشر.

    docker compose run --rm --no-deps -e RUN_MIGRATIONS=0 backend python scripts/check_db.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.db_url import engine_options, is_supabase_host, is_transaction_pooler, parse, redact  # noqa: E402

HINTS = {
    "Network is unreachable": "الاتصال المباشر (db.xxx.supabase.co) IPv6 فقط وDocker لا يدعمه افتراضيًا؛ استخدم Session pooler (aws-0-REGION.pooler.supabase.com:5432).",
    "password authentication failed": "كلمة المرور خطأ، أو تحتاج ترميزًا (URL-encoding) لرموزها الخاصة، أو اسم المستخدم لا يتضمن project-ref (postgres.<ref>) عند المجمّع.",
    "Tenant or user not found": "اسم المستخدم مع المجمّع يجب أن يكون postgres.<project-ref> وليس postgres فقط، والمنطقة (REGION) في المضيف يجب أن تطابق مشروعك.",
    "SSL": "تأكد من sslmode=require في الرابط وأن القاعدة تقبل اتصالات SSL.",
    "timeout": "لا وصول للشبكة: تحقق من الجدار الناري/قيود الشبكة (Network Restrictions) في Supabase.",
}


def check(label: str, url: str, *, pooled: bool) -> bool:
    print(f"\n── {label}: {redact(url)}")
    parsed = parse(url)
    if is_supabase_host(parsed.host):
        kind = "مجمّع المعاملات (6543)" if is_transaction_pooler(url) else ("Session pooler" if "pooler" in (parsed.host or "") else "اتصال مباشر")
        print(f"   النوع: {kind}")
    options = engine_options(url, pool_size=1, max_overflow=0, pool_recycle=1800, disable_prepared_statements=settings.DB_DISABLE_PREPARED_STATEMENTS)
    for key in ("pool_size", "max_overflow", "pool_recycle"):
        options.pop(key, None)
    engine = create_engine(url, poolclass=NullPool, **options)
    try:
        with engine.connect() as connection:
            row = connection.execute(text("SELECT version(), current_user, current_database()")).one()
            print(f"   ✓ متصل — {row[0].split(',')[0]} | المستخدم: {row[1]} | القاعدة: {row[2]}")
            if engine.dialect.name == "postgresql":
                ssl = connection.execute(text("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()")).scalar()
                print(f"   {'✓' if ssl else '✗'} SSL: {'مفعّل' if ssl else 'غير مفعّل!'}")
                if not ssl and is_supabase_host(parsed.host):
                    return False
                if pooled:
                    # psycopg يحوّل الأمر المتكرر لـ prepared statement بعد 5 تنفيذات؛ يفشل خلف مجمّع المعاملات إن لم يُعطَّل
                    for _ in range(8):
                        connection.execute(text("SELECT :n"), {"n": 1})
                    print("   ✓ تكرار الأوامر (prepared statements) سليم")
                    tables = connection.execute(text("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")).scalar()
                    revision = None
                    try:
                        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
                    except Exception:  # noqa: BLE001
                        connection.rollback()
                    print(f"   جداول public: {tables} | نسخة المخطط (alembic): {revision or 'لم تُطبَّق الـ migrations بعد'}")
        return True
    except Exception as error:  # noqa: BLE001
        message = str(error).splitlines()[0]
        print(f"   ✗ فشل: {message}")
        for needle, hint in HINTS.items():
            if needle.lower() in str(error).lower():
                print(f"   → {hint}")
        return False


def main() -> int:
    print(f"البيئة: {settings.ENVIRONMENT}")
    ok = check("DATABASE_URL (وقت التشغيل)", settings.DATABASE_URL, pooled=True)
    if settings.MIGRATION_DATABASE_URL:
        ok = check("MIGRATION_DATABASE_URL (الـ migrations)", settings.MIGRATION_DATABASE_URL, pooled=False) and ok
    elif is_transaction_pooler(settings.DATABASE_URL):
        print("\n✗ DATABASE_URL على المنفذ 6543 بلا MIGRATION_DATABASE_URL: الـ migrations ستُرفض.")
        ok = False
    print("\n" + ("✓ كل الفحوص سليمة" if ok else "✗ توجد مشاكل أعلاه"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
