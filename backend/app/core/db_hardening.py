"""تحصين مخطط public في PostgreSQL/Supabase (يُنفَّذ بعد كل ترحيل، وهو idempotent).

لماذا؟ Supabase يكشف جداول مخطط public عبر واجهة REST الجاهزة (PostgREST) بمفتاح anon العام، وتُمنح
الأدوار anon/authenticated صلاحيات تلقائية على أي جدول جديد. تطبيقنا لا يستخدم تلك الواجهة إطلاقًا
(الاتصال المباشر بدور postgres المالك)، فنغلقها على طبقتين:
  1) تفعيل Row Level Security على كل جدول بلا سياسات ⇒ أي دور غير مالك لا يرى ولا يكتب شيئًا.
     المالك (دور الـ backend) يتجاوز RLS فلا يتأثر التطبيق.
  2) سحب صلاحيات anon/authenticated من الجداول الحالية وعلى الجداول المستقبلية.
على PostgreSQL عادي (بلا هذه الأدوار) يفعّل RLS فقط، وهو بلا أثر على المالك.
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Connection

logger = logging.getLogger(__name__)
SUPABASE_API_ROLES = ("anon", "authenticated")

_UNPROTECTED_TABLES = text(
    """
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity AND pg_get_userbyid(c.relowner) = current_user
    ORDER BY c.relname
    """
)


def harden_public_schema(connection: Connection) -> dict[str, list[str]]:
    """يعيد {"rls_enabled": [...جداول فُعّل عليها RLS الآن], "revoked_roles": [...]}."""
    result: dict[str, list[str]] = {"rls_enabled": [], "revoked_roles": []}
    if connection.dialect.name != "postgresql":
        return result
    quote = connection.dialect.identifier_preparer.quote

    for table in connection.execute(_UNPROTECTED_TABLES).scalars().all():
        connection.execute(text(f"ALTER TABLE public.{quote(table)} ENABLE ROW LEVEL SECURITY"))
        result["rls_enabled"].append(table)

    existing = set(
        connection.execute(text("SELECT rolname FROM pg_roles WHERE rolname = ANY(:roles)"), {"roles": list(SUPABASE_API_ROLES)})
        .scalars()
        .all()
    )
    for role in SUPABASE_API_ROLES:
        if role not in existing:
            continue
        statements = [
            f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {role}",
            f"REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {role}",
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM {role}",
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM {role}",
        ]
        try:
            with connection.begin_nested():
                for statement in statements:
                    connection.execute(text(statement))
            result["revoked_roles"].append(role)
        except Exception as error:  # noqa: BLE001 — صلاحيات غير كافية: نكتفي بـ RLS ونحذّر
            logger.warning("تعذّر سحب صلاحيات %s: %s", role, error)
    return result
