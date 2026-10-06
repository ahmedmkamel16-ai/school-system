"""ترحيل قاعدة البيانات عند الإقلاع: ينتظر جاهزية القاعدة ثم `alembic upgrade head` ثم تحصين المخطط.

- يستخدم MIGRATION_DATABASE_URL (اتصال مباشر/Session على 5432) إن وُجد، وإلا DATABASE_URL.
  يرفض الاتصال عبر مجمّع المعاملات (6543): الأقفال والترحيل لا يعملان عبره بشكل موثوق.
- على PostgreSQL يُؤخذ advisory lock طوال الترحيل: إن أقلعت عدة نسخ معًا تنتظر الثانية الأولى
  ثم تجد القاعدة محدَّثة ولا تتسابق عليها.
"""

import logging
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.db_hardening import harden_public_schema  # noqa: E402
from app.core.db_url import engine_options, is_transaction_pooler, redact  # noqa: E402

LOCK_ID = 727_274_001
WAIT_SECONDS = 90


def build_engine():
    url = settings.migration_database_url
    if is_transaction_pooler(url):
        print(
            "[migrate] ✗ رابط الترحيل على المنفذ 6543 (مجمّع المعاملات). استخدم اتصالًا مباشرًا أو Session pooler (المنفذ 5432) "
            "في MIGRATION_DATABASE_URL.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    options = engine_options(url, pool_size=1, max_overflow=0, pool_recycle=1800)
    for key in ("pool_size", "max_overflow", "pool_recycle"):
        options.pop(key, None)
    return create_engine(url, poolclass=NullPool, **options)


def wait_for_database(engine) -> None:
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return
        except Exception as error:  # noqa: BLE001
            if time.monotonic() > deadline:
                print(f"[migrate] ✗ القاعدة غير متاحة بعد {WAIT_SECONDS}ث: {str(error).splitlines()[0]}", file=sys.stderr)
                raise SystemExit(1)
            print("[migrate] بانتظار قاعدة البيانات...", flush=True)
            time.sleep(2)


def main() -> None:
    logging.basicConfig(level=logging.WARNING)
    engine = build_engine()
    print(f"[migrate] الوجهة: {redact(settings.migration_database_url)}", flush=True)
    wait_for_database(engine)

    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "alembic"))
    is_postgres = engine.dialect.name == "postgresql"
    with engine.connect() as lock_connection:
        if is_postgres:
            lock_connection.execute(text("SELECT pg_advisory_lock(:id)"), {"id": LOCK_ID})
            lock_connection.commit()
        try:
            print(f"[migrate] alembic upgrade head ({engine.dialect.name}, env={settings.ENVIRONMENT})", flush=True)
            command.upgrade(config, "head")
            with engine.begin() as connection:
                hardened = harden_public_schema(connection)
            if hardened["rls_enabled"]:
                print(f"[migrate] RLS فُعّل على: {', '.join(hardened['rls_enabled'])}", flush=True)
            print("[migrate] تم", flush=True)
        finally:
            if is_postgres:
                lock_connection.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": LOCK_ID})
                lock_connection.commit()


if __name__ == "__main__":
    main()
