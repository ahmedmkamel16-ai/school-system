"""معالجة روابط الاتصال بقاعدة البيانات (PostgreSQL المحلية، أو Supabase بمجمّعاته).

ما تفعله هذه الوحدة:
  * تقبل الرابط كما تنسخه من لوحة Supabase (postgresql:// أو postgres://) وتحوّله لمشغّل psycopg 3.
  * تفرض SSL على مضيفات Supabase (تضيف sslmode=require إن غاب، وترفض disable/allow/prefer).
  * تزيل معاملات غير معروفة لـ libpq تظهر في أمثلة بعض الأدوات (pgbouncer، connection_limit).
  * تكتشف مجمّع المعاملات (Transaction pooler، المنفذ 6543) وتعطّل الـ prepared statements معه،
    لأن PgBouncer/Supavisor في هذا الوضع يوزّع كل أمر على اتصال مختلف.
"""

from sqlalchemy.engine import URL, make_url

SUPABASE_SUFFIXES = (".supabase.co", ".supabase.com")
TRANSACTION_POOLER_PORT = 6543
_UNSAFE_SSL_MODES = {"disable", "allow", "prefer"}
_STRIPPED_PARAMS = {"pgbouncer", "connection_limit", "pool_timeout"}


class DatabaseUrlError(ValueError):
    pass


def is_supabase_host(host: str | None) -> bool:
    return bool(host) and host.lower().endswith(SUPABASE_SUFFIXES)


def normalize_database_url(raw: str) -> str:
    """يعيد رابطًا صالحًا لـ SQLAlchemy؛ يرفع DatabaseUrlError برسالة عربية عند وجود مشكلة."""
    raw = raw.strip()
    if not raw:
        raise DatabaseUrlError("رابط قاعدة البيانات فارغ")
    try:
        url = make_url(raw)
    except Exception as error:  # noqa: BLE001
        raise DatabaseUrlError(
            "رابط قاعدة البيانات غير صالح — غالبًا بسبب رموز خاصة في كلمة المرور (@ : / # ? %). "
            "رمّزها بـ URL-encoding (انظر DEPLOYMENT.md)"
        ) from error

    if url.drivername.split("+")[0] not in ("postgres", "postgresql"):
        return raw  # sqlite وغيره بلا تعديل
    if url.host and "@" in url.host:
        # علامة @ غير مرمَّزة داخل كلمة المرور تُقرأ خطأً كجزء من المضيف (p@ss@host)
        raise DatabaseUrlError("رابط قاعدة البيانات غير صالح: توجد @ في كلمة المرور؛ رمّزها بـ URL-encoding (@ ← %40)")

    if url.drivername in ("postgres", "postgresql"):
        url = url.set(drivername="postgresql+psycopg")

    query = {k: v for k, v in url.query.items() if k not in _STRIPPED_PARAMS}
    if is_supabase_host(url.host):
        mode = str(query.get("sslmode", "")).lower()
        if mode in _UNSAFE_SSL_MODES:
            raise DatabaseUrlError(f"Supabase يتطلب اتصالًا مشفرًا: sslmode={mode} غير مسموح (استخدم require أو verify-full)")
        query.setdefault("sslmode", "require")
    return url.set(query=query).render_as_string(hide_password=False)


def parse(url_string: str) -> URL:
    return make_url(url_string)


def is_transaction_pooler(url_string: str) -> bool:
    url = make_url(url_string)
    return url.drivername.split("+")[0] in ("postgres", "postgresql") and url.port == TRANSACTION_POOLER_PORT


def redact(url_string: str) -> str:
    """رابط آمن للطباعة في السجلات (كلمة المرور مخفية)."""
    return make_url(url_string).render_as_string(hide_password=True)


def engine_options(
    url_string: str,
    *,
    pool_size: int,
    max_overflow: int,
    pool_recycle: int,
    disable_prepared_statements: bool | None = None,
) -> dict:
    """وسائط create_engine المناسبة لنوع القاعدة والمجمّع.

    disable_prepared_statements: None = تلقائي (يُعطَّل عند منفذ مجمّع المعاملات 6543).
    """
    url = make_url(url_string)
    if url.drivername.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}, "pool_pre_ping": True}

    connect_args: dict = {"connect_timeout": 10}
    no_prepared = is_transaction_pooler(url_string) if disable_prepared_statements is None else disable_prepared_statements
    if no_prepared and url.drivername.endswith("psycopg"):
        connect_args["prepare_threshold"] = None  # psycopg 3: لا prepared statements خلف مجمّع المعاملات
    return {
        "connect_args": connect_args,
        "pool_pre_ping": True,  # يتجاوز الاتصالات الميتة (إعادة تشغيل/مهلة المجمّع)
        "pool_size": pool_size,
        "max_overflow": max_overflow,
        "pool_recycle": pool_recycle,
    }
