import os
import subprocess
import sys

import pytest
from pydantic import ValidationError
from sqlalchemy.engine import make_url

from app.core.config import Settings
from app.core.db_url import (
    DatabaseUrlError,
    engine_options,
    is_supabase_host,
    is_transaction_pooler,
    normalize_database_url,
    redact,
)

REF = "abcdefghijklmnop"
POOLER_HOST = "aws-0-eu-central-1.pooler.supabase.com"
KEY = "k" * 64


def test_dashboard_urls_are_converted_to_psycopg():
    for scheme in ("postgresql", "postgres"):
        out = normalize_database_url(f"{scheme}://postgres.{REF}:pw@{POOLER_HOST}:6543/postgres")
        assert out.startswith("postgresql+psycopg://postgres.")
    explicit = "postgresql+psycopg://u:p@db.internal:5432/app"
    assert normalize_database_url(explicit) == explicit


def test_sqlite_and_other_backends_untouched():
    assert normalize_database_url("sqlite:///./x.db") == "sqlite:///./x.db"
    assert normalize_database_url("sqlite://") == "sqlite://"


def test_supabase_hosts_get_ssl_and_unsafe_modes_are_refused():
    out = make_url(normalize_database_url(f"postgresql://postgres.{REF}:pw@{POOLER_HOST}:5432/postgres"))
    assert out.query["sslmode"] == "require"
    direct = make_url(normalize_database_url(f"postgresql://postgres:pw@db.{REF}.supabase.co:5432/postgres"))
    assert direct.query["sslmode"] == "require"
    kept = make_url(normalize_database_url(f"postgresql://u:p@{POOLER_HOST}:5432/postgres?sslmode=verify-full&sslrootcert=/ca.crt"))
    assert kept.query["sslmode"] == "verify-full" and kept.query["sslrootcert"] == "/ca.crt"
    for mode in ("disable", "allow", "prefer"):
        with pytest.raises(DatabaseUrlError, match="SSL|مشفر"):
            normalize_database_url(f"postgresql://u:p@{POOLER_HOST}:5432/postgres?sslmode={mode}")


def test_non_supabase_hosts_do_not_get_forced_ssl():
    out = make_url(normalize_database_url("postgresql://u:p@db:5432/app"))
    assert "sslmode" not in out.query
    assert not is_supabase_host("db") and is_supabase_host(f"db.{REF}.supabase.co") and is_supabase_host(POOLER_HOST)


def test_foreign_tool_params_are_stripped():
    out = make_url(normalize_database_url(f"postgresql://u:p@{POOLER_HOST}:6543/postgres?pgbouncer=true&connection_limit=1"))
    assert set(out.query) == {"sslmode"}


def test_special_characters_in_password_survive_when_encoded():
    from urllib.parse import quote

    password = "p@ss:w/rd#?%$&"
    url = f"postgresql://postgres.{REF}:{quote(password, safe='')}@{POOLER_HOST}:5432/postgres"
    parsed = make_url(normalize_database_url(url))
    assert parsed.password == password and parsed.username == f"postgres.{REF}" and parsed.host == POOLER_HOST
    assert password not in redact(url) and "***" in redact(url)


def test_raw_special_characters_are_tolerated_but_raw_at_sign_is_refused():
    # SQLAlchemy يقرأ / # ? % الخام ضمن كلمة المرور ويعيد ترميزها عند الاتصال
    for raw in ("pa/ss", "pa#ss", "pa?ss", "pa%ss"):
        parsed = make_url(normalize_database_url(f"postgresql://u:{raw}@{POOLER_HOST}:5432/postgres"))
        assert parsed.password == raw and parsed.host == POOLER_HOST
    # لكن @ الخام ملتبسة (تُقرأ جزءًا من المضيف) فنرفضها برسالة واضحة بدل اتصال بمضيف خاطئ
    with pytest.raises(DatabaseUrlError, match="%40"):
        normalize_database_url("postgresql://u:p@ss@host:5432/db")
    with pytest.raises(DatabaseUrlError, match="URL-encoding"):
        normalize_database_url("postgresql://u:p@host:abc/db")
    with pytest.raises(DatabaseUrlError):
        normalize_database_url("   ")


def test_transaction_pooler_detection_and_engine_options():
    pooled = f"postgresql+psycopg://postgres.{REF}:pw@{POOLER_HOST}:6543/postgres"
    session = f"postgresql+psycopg://postgres.{REF}:pw@{POOLER_HOST}:5432/postgres"
    assert is_transaction_pooler(pooled) and not is_transaction_pooler(session)
    kw = dict(pool_size=3, max_overflow=2, pool_recycle=600)
    on = engine_options(pooled, **kw)
    assert on["connect_args"]["prepare_threshold"] is None  # لا prepared statements خلف المجمّع
    assert on["pool_size"] == 3 and on["max_overflow"] == 2 and on["pool_pre_ping"] is True
    assert "prepare_threshold" not in engine_options(session, **kw)["connect_args"]
    assert "prepare_threshold" in engine_options(session, disable_prepared_statements=True, **kw)["connect_args"]
    assert "prepare_threshold" not in engine_options(pooled, disable_prepared_statements=False, **kw)["connect_args"]
    assert engine_options("sqlite:///x.db", **kw)["connect_args"] == {"check_same_thread": False}


def build(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


def test_settings_normalize_both_urls_and_fall_back():
    s = build(
        DATABASE_URL=f"postgresql://postgres.{REF}:pw@{POOLER_HOST}:6543/postgres",
        MIGRATION_DATABASE_URL=f"postgresql://postgres.{REF}:pw@{POOLER_HOST}:5432/postgres",
    )
    assert s.DATABASE_URL.startswith("postgresql+psycopg://") and "sslmode=require" in s.DATABASE_URL
    assert ":5432/" in s.migration_database_url
    assert build(DATABASE_URL="sqlite://").migration_database_url == "sqlite://"
    assert build(DATABASE_URL="sqlite://", MIGRATION_DATABASE_URL="  ").MIGRATION_DATABASE_URL is None  # فارغ = غير محدد
    with pytest.raises(ValidationError, match="SSL|مشفر"):
        build(DATABASE_URL=f"postgresql://u:p@{POOLER_HOST}:5432/postgres?sslmode=disable")


def test_production_requires_a_direct_url_for_migrations_when_runtime_is_pooled():
    pooled = f"postgresql://postgres.{REF}:pw@{POOLER_HOST}:6543/postgres"
    session = f"postgresql://postgres.{REF}:pw@{POOLER_HOST}:5432/postgres"
    with pytest.raises(ValidationError, match="MIGRATION_DATABASE_URL"):
        build(ENVIRONMENT="production", SECRET_KEY=KEY, DATABASE_URL=pooled)
    with pytest.raises(ValidationError, match="6543"):
        build(ENVIRONMENT="production", SECRET_KEY=KEY, DATABASE_URL=pooled, MIGRATION_DATABASE_URL=pooled)
    ok = build(ENVIRONMENT="production", SECRET_KEY=KEY, DATABASE_URL=pooled, MIGRATION_DATABASE_URL=session)
    assert is_transaction_pooler(ok.DATABASE_URL) and not is_transaction_pooler(ok.migration_database_url)
    build(ENVIRONMENT="production", SECRET_KEY=KEY, DATABASE_URL=session)  # Session pooler وحده يكفي


def test_migrate_script_refuses_transaction_pooler():
    root = os.path.dirname(os.path.dirname(__file__))
    env = {**os.environ, "DATABASE_URL": f"postgresql://postgres.{REF}:pw@{POOLER_HOST}:6543/postgres", "MIGRATION_DATABASE_URL": f"postgresql://postgres.{REF}:pw@{POOLER_HOST}:6543/postgres"}
    result = subprocess.run([sys.executable, "scripts/migrate.py"], cwd=root, env=env, capture_output=True, text=True, timeout=60)
    assert result.returncode == 2 and "6543" in result.stderr
