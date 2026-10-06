# syntax=docker/dockerfile:1.7
# ---------- المرحلة 1: بناء البيئة الافتراضية (أدوات البناء لا تدخل الصورة النهائية) ----------
ARG PYTHON_IMAGE=python:3.13-slim
FROM ${PYTHON_IMAGE} AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build
COPY requirements.txt .
RUN pip install -r requirements.txt

# ---------- المرحلة 2: صورة التشغيل الضئيلة ----------
FROM ${PYTHON_IMAGE} AS runtime

# مستخدم غير جذر بلا shell لتسجيل الدخول
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=production

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app app ./app
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app alembic.ini gunicorn.conf.py docker-entrypoint.sh ./
COPY --chown=app:app scripts/migrate.py scripts/create_admin.py ./scripts/

USER app
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4).status == 200 else 1)"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["gunicorn", "-c", "gunicorn.conf.py", "app.main:app"]
