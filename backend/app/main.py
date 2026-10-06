from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.routers import (
    attendance,
    audit,
    auth,
    classrooms,
    curriculum,
    dashboard,
    financials,
    grades,
    students,
    subjects,
    teacher_attendance,
    teachers,
    timetable,
    users,
)

# التوثيق التفاعلي (/docs, /redoc, /openapi.json) يكشف سطح الـ API كاملًا: يُعطَّل في الإنتاج
_docs = {"docs_url": None, "redoc_url": None, "openapi_url": None} if settings.is_production else {}
app = FastAPI(title=settings.PROJECT_NAME, **_docs)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(students.router, prefix=settings.API_V1_PREFIX)
app.include_router(teachers.router, prefix=settings.API_V1_PREFIX)
app.include_router(classrooms.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(attendance.router, prefix=settings.API_V1_PREFIX)
app.include_router(audit.router, prefix=settings.API_V1_PREFIX)
app.include_router(subjects.router, prefix=settings.API_V1_PREFIX)
app.include_router(timetable.router, prefix=settings.API_V1_PREFIX)
app.include_router(curriculum.router, prefix=settings.API_V1_PREFIX)
app.include_router(teacher_attendance.router, prefix=settings.API_V1_PREFIX)
app.include_router(dashboard.router, prefix=settings.API_V1_PREFIX)
app.include_router(grades.router, prefix=settings.API_V1_PREFIX)
app.include_router(financials.router, prefix=settings.API_V1_PREFIX)


@app.get("/")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": settings.PROJECT_NAME}


@app.get(f"{settings.API_V1_PREFIX}/health", include_in_schema=False)
def health() -> dict[str, str]:
    """فحص الجاهزية (للـ healthcheck والـ Nginx): يتأكد من الوصول لقاعدة البيانات فعلًا."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="database unavailable")
    return {"status": "ok"}
