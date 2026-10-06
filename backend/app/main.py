from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
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

app = FastAPI(title=settings.PROJECT_NAME)

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
