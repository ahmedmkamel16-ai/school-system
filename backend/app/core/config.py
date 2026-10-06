from decimal import Decimal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "School SIS API"
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "sqlite:///./school_sis.db"

    SECRET_KEY: str = "change-this-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # الحجب المالي لشهادة ولي الأمر: يُفعَّل إذا تجاوز مجموع المتأخر (بعد فترة سماح) هذا الحد
    FINANCIAL_HOLD_ENABLED: bool = True
    FINANCIAL_HOLD_THRESHOLD_AMOUNT: Decimal = Decimal("0")
    FINANCIAL_HOLD_GRACE_DAYS: int = 0

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()
