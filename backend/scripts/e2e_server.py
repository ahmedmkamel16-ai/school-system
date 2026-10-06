"""خادم الاختبارات الشاملة (E2E) — لا يُشحن مع التطبيق.

يشغّل تطبيق FastAPI نفسه على قاعدة SQLite مؤقتة، ويضيف مسار POST /__e2e__/reset الذي يعيد
بناء الجداول وبذر بيانات scripts/seed_e2e.py قبل كل ملف اختبار. يرفض العمل بدون E2E_MODE=1.

    E2E_MODE=1 python scripts/e2e_server.py          # من مجلد backend
"""

import os
import sys
from pathlib import Path

if os.environ.get("E2E_MODE") != "1":
    sys.exit("يعمل هذا الخادم في وضع E2E_MODE=1 فقط")

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "scripts")]
os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'e2e.db'}")
os.environ.setdefault("CORS_ORIGINS", '["http://127.0.0.1:5173"]')

import uvicorn  # noqa: E402
from sqlmodel import Session, SQLModel  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from seed_e2e import seed  # noqa: E402


@app.post("/__e2e__/reset", include_in_schema=False)
def reset() -> dict[str, str]:
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed(session)
    return {"status": "reset"}


if __name__ == "__main__":
    SQLModel.metadata.create_all(engine)
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("E2E_API_PORT", "8000")), log_level="warning")
