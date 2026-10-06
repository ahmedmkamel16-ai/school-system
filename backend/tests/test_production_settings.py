import pytest
from pydantic import ValidationError

from app.core.config import DEFAULT_SECRET_KEY, Settings

GOOD_KEY = "a" * 64


def build(**kwargs) -> Settings:
    # _env_file=None: لا نقرأ .env المطوّر أثناء الاختبار
    return Settings(_env_file=None, **kwargs)


def test_development_allows_default_key():
    assert build().SECRET_KEY == DEFAULT_SECRET_KEY
    assert build(ENVIRONMENT="development").is_production is False


@pytest.mark.parametrize(
    "key",
    [DEFAULT_SECRET_KEY, "CHANGE-THIS-SECRET-KEY-IN-PRODUCTION", "secret", "changeme", "   ", "", "short-key", "x" * 31],
)
def test_production_refuses_weak_or_missing_secret(key):
    with pytest.raises(ValidationError, match="رُفض الإقلاع"):
        build(ENVIRONMENT="production", SECRET_KEY=key)


def test_production_requires_secret_even_when_not_provided():
    with pytest.raises(ValidationError):
        build(ENVIRONMENT="production")  # يبقى المفتاح الافتراضي ⇒ يُرفض


def test_production_accepts_strong_key_and_rejects_wildcard_cors():
    assert build(ENVIRONMENT="production", SECRET_KEY=GOOD_KEY).is_production is True
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        build(ENVIRONMENT="production", SECRET_KEY=GOOD_KEY, CORS_ORIGINS=["*"])


def test_unknown_environment_value_is_rejected():
    with pytest.raises(ValidationError):
        build(ENVIRONMENT="prod")


def test_app_import_fails_in_production_with_default_key():
    """الإقلاع الفعلي (import app.main) يفشل ولا يعمل بصمت."""
    import os
    import subprocess
    import sys

    root = os.path.dirname(os.path.dirname(__file__))
    env = {**os.environ, "ENVIRONMENT": "production", "SECRET_KEY": DEFAULT_SECRET_KEY}
    result = subprocess.run([sys.executable, "-c", "import app.main"], cwd=root, env=env, capture_output=True, text=True)
    assert result.returncode != 0 and "رُفض الإقلاع" in result.stderr
    env["SECRET_KEY"] = GOOD_KEY
    ok = subprocess.run([sys.executable, "-c", "import app.main"], cwd=root, env=env, capture_output=True, text=True)
    assert ok.returncode == 0, ok.stderr


def test_docs_hidden_in_production_and_health_available():
    import os
    import subprocess
    import sys

    root = os.path.dirname(os.path.dirname(__file__))
    code = (
        "from fastapi.testclient import TestClient; from app.main import app; c=TestClient(app); "
        "print(c.get('/docs').status_code, c.get('/openapi.json').status_code, c.get('/api/v1/health').status_code)"
    )
    env = {**os.environ, "ENVIRONMENT": "production", "SECRET_KEY": GOOD_KEY, "DATABASE_URL": "sqlite://"}
    out = subprocess.run([sys.executable, "-c", code], cwd=root, env=env, capture_output=True, text=True)
    assert out.stdout.split() == ["404", "404", "200"], out.stderr
    dev = subprocess.run([sys.executable, "-c", code], cwd=root, env={**os.environ, "DATABASE_URL": "sqlite://"}, capture_output=True, text=True)
    assert dev.stdout.split()[:2] == ["200", "200"]
