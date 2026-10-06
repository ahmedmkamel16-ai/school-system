#!/bin/sh
# ينتظر قاعدة البيانات، ينفّذ الـ migrations (بقفل يمنع تسابق النسخ المتعددة)، ثم يشغّل الأمر (gunicorn).
set -eu

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
    python scripts/migrate.py
fi

exec "$@"
