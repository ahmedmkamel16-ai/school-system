from decimal import Decimal
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "change-this-secret-key-in-production"
# قيم شائعة مرفوضة في الإنتاج حتى لو طالت (نسخ من أمثلة/توثيق)
_WEAK_SECRETS = {DEFAULT_SECRET_KEY, "secret", "changeme", "change-me", "password", "your-secret-key", "please-change-me"}
MIN_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # production ⇒ فحوصات إقلاع صارمة (انظر _validate_production) وإخفاء التوثيق التفاعلي
    ENVIRONMENT: Literal["development", "production"] = "development"

    PROJECT_NAME: str = "School SIS API"
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "sqlite:///./school_sis.db"

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
