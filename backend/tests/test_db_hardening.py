"""يتطلب PostgreSQL: TEST_DATABASE_URL=postgresql+psycopg://... (يُتخطّى مع SQLite)."""

import os

import pytest
from sqlalchemy import create_engine, text
from sqlmodel import SQLModel

import app.models  # noqa: F401
from app.core.db_hardening import harden_public_schema

pytestmark = pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="يحتاج PostgreSQL (TEST_DATABASE_URL)")


@pytest.fixture()
def pg():
    engine = create_engine(os.environ["TEST_DATABASE_URL"])
    SQLModel.metadata.drop_all(engine)
    with engine.begin() as c:
        # يحاكي Supabase: أدوار API وصلاحيات افتراضية على كل جدول جديد
        for role in ("anon", "authenticated"):
            c.execute(text(f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{role}') THEN CREATE ROLE {role} NOLOGIN; END IF; END $$"))
        c.execute(text("GRANT USAGE ON SCHEMA public TO anon, authenticated"))
        c.execute(text("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated"))
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)
    engine.dispose()


def test_rls_enabled_and_api_roles_locked_out_idempotently(pg):
    with pg.connect() as c:
        assert c.execute(text("SELECT has_table_privilege('anon', 'student', 'select')")).scalar() is True  # الخطر قبل التحصين
    with pg.begin() as c:
        first = harden_public_schema(c)
    assert "student" in first["rls_enabled"] and set(first["revoked_roles"]) == {"anon", "authenticated"}
    with pg.connect() as c:
        assert c.execute(text("SELECT bool_and(relrowsecurity) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'")).scalar() is True
        for role in ("anon", "authenticated"):
            assert c.execute(text(f"SELECT has_table_privilege('{role}', 'payment_receipts', 'select')")).scalar() is False
        # جدول يُنشأ لاحقًا لا يمنح الدورين شيئًا (ALTER DEFAULT PRIVILEGES)
        c.execute(text("CREATE TABLE zz_later (id int)"))
        assert c.execute(text("SELECT has_table_privilege('anon', 'zz_later', 'select')")).scalar() is False
        c.execute(text("DROP TABLE zz_later"))
        c.commit()
    with pg.begin() as c:
        again = harden_public_schema(c)
    assert again["rls_enabled"] == []  # idempotent
    with pg.connect() as c:  # المالك (دور الـ backend) يتجاوز RLS فيبقى التطبيق يعمل
        assert c.execute(text("SELECT count(*) FROM student")).scalar() == 0


def test_noop_on_sqlite():
    engine = create_engine("sqlite://")
    with engine.begin() as c:
        assert harden_public_schema(c) == {"rls_enabled": [], "revoked_roles": []}
