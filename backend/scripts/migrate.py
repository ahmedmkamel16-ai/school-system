"""ترحيل قاعدة البيانات عند الإقلاع: ينتظر جاهزية القاعدة ثم يشغّل `alembic upgrade head`.

على PostgreSQL يُؤخذ advisory lock طوال الترحيل، فإن أقلعت عدة نسخ من الـ backend معًا
(نشر متدرّج/replicas) تنتظر الثانية الأولى ثم تجد القاعدة محدَّثة ولا تتسابق عليها.
"""

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import engine  # noqa: E402

LOCK_ID = 727_274_001
WAIT_SECONDS = 90


def wait_for_database() -> None:
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return
        except Exception as error:  # noqa: BLE001
            if time.monotonic() > deadline:
                print(f"[migrate] القاعدة غير متاحة بعد {WAIT_SECONDS}ث: {error}", file=sys.stderr)
                raise SystemExit(1)
            print("[migrate] بانتظار قاعدة البيانات...", flush=True)
            time.sleep(2)


def main() -> None:
    wait_for_database()
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
            print("[migrate] تم", flush=True)
        finally:
            if is_postgres:
                lock_connection.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": LOCK_ID})
                lock_connection.commit()


if __name__ == "__main__":
    main()
