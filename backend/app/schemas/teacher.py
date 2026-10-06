from pydantic import BaseModel

from app.models.teacher import TeacherStatus


class TeacherCreate(BaseModel):
    full_name: str
    email: str
    phone: str
    subject_ids: list[int] = []
    grade_levels: list[str] = []
    max_periods_per_week: int = 24


class TeacherUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    status: TeacherStatus | None = None
    subject_ids: list[int] | None = None
    grade_levels: list[str] | None = None
    max_periods_per_week: int | None = None


class TeacherRead(BaseModel):
    id: int
    full_name: str
    email: str
    phone: str
    status: TeacherStatus
    max_periods_per_week: int
    subject_ids: list[int] = []
    grade_levels: list[str] = []
