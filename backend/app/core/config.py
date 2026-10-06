from decimal import Decimal
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "change-this-secret-key-in-production"
# قيم شائعة مرفوضة في الإنتاج حتى لو طالت (نسخ من أمثلة/توثيق)
_WEAK_SECRETS = {DEFAULT_SECRET_KEY, "secret", "changeme", "change-me", "password", "your-secret-key", "please-change-me"}
MIN_SECRET_KEY_LENGTH = 32

from app.core.db_url import DatabaseUrlError, is_transaction_pooler, normalize_database_url  # noqa: E402


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # production ⇒ فحوصات إقلاع صارمة (انظر _validate_production) وإخفاء التوثيق التفاعلي
    ENVIRONMENT: Literal["development", "production"] = "development"

    PROJECT_NAME: str = "School SIS API"
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "sqlite:///./school_sis.db"
    # اتصال مباشر/Session pooler (المنفذ 5432) يُستخدم للـ migrations فقط. اتركه فارغًا إن كان DATABASE_URL نفسه
    # مباشرًا. مع مجمّع المعاملات (6543) في DATABASE_URL يصبح إلزاميًا (الـ migrations والأقفال لا تعمل عبره).
    MIGRATION_DATABASE_URL: str | None = None
    # حجم تجمّع اتصالات كل عملية gunicorn: العدد الكلي = نسخ × عمال × (POOL_SIZE + MAX_OVERFLOW)
    DB_POOL_SIZE: int = 3
    DB_MAX_OVERFLOW: int = 2
    DB_POOL_RECYCLE: int = 1800
    # None = تلقائي (يُعطَّل عند المنفذ 6543)؛ true/false لفرض السلوك
    DB_DISABLE_PREPARED_STATEMENTS: bool | None = None

    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # الحجب المالي لشهادة ولي الأمر: يُفعَّل إذا تجاوز مجموع المتأخر (بعد فترة سماح) هذا الحد
    FINANCIAL_HOLD_ENABLED: bool = True
    FINANCIAL_HOLD_THRESHOLD_AMOUNT: Decimal = Decimal("0")
    FINANCIAL_HOLD_GRACE_DAYS: int = 0

    # أول مدير: false في الإنتاج (يُنشأ بـ scripts/create_admin.py بدل مسار تسجيل مفتوح لأول مستخدم)
    ALLOW_BOOTSTRAP_REGISTRATION: bool = True

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        try:
            return normalize_database_url(value)
        except DatabaseUrlError as error:
            raise ValueError(str(error)) from error

    @field_validator("MIGRATION_DATABASE_URL", mode="after")
    @classmethod
    def _normalize_migration_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        try:
            return normalize_database_url(value)
        except DatabaseUrlError as error:
            raise ValueError(str(error)) from error

    @property
    def migration_database_url(self) -> str:
        """الرابط المستخدم لـ alembic وأقفال الترحيل (مباشر/Session)."""
        return self.MIGRATION_DATABASE_URL or self.DATABASE_URL

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def _validate_production(self) -> "Settings":
        """يرفض الإقلاع في الإنتاج بإعدادات غير آمنة، بدل العمل بصمت بمفتاح قابل للتخمين."""
        if not self.is_production:
            return self
        problems: list[str] = []
        key = self.SECRET_KEY.strip()
        if key.lower() in _WEAK_SECRETS:
            problems.append("SECRET_KEY يساوي القيمة الافتراضية/الضعيفة أو غير محدد")
        elif len(key) < MIN_SECRET_KEY_LENGTH:
            problems.append(f"SECRET_KEY أقصر من {MIN_SECRET_KEY_LENGTH} حرفًا")
        if self.MIGRATION_DATABASE_URL is None and is_transaction_pooler(self.DATABASE_URL):
            problems.append(
                "DATABASE_URL يستخدم مجمّع المعاملات (المنفذ 6543) فيلزم MIGRATION_DATABASE_URL باتصال Session/مباشر (5432) للـ migrations"
            )
        if is_transaction_pooler(self.migration_database_url):
            problems.append("MIGRATION_DATABASE_URL لا يجوز أن يكون على المنفذ 6543 (مجمّع المعاملات)")
        if "*" in self.CORS_ORIGINS:
            problems.append("CORS_ORIGINS لا يجوز أن يحتوي * في الإنتاج")
        if problems:
            raise ValueError(
                "إعدادات الإنتاج غير آمنة — رُفض الإقلاع: "
                + "؛ ".join(problems)
                + ". ولّد مفتاحًا بـ: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return self


settings = Settings()
