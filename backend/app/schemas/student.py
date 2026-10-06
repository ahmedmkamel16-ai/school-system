from datetime import date, datetime

from pydantic import BaseModel

from app.models.student import StudentStatus


class StudentCreate(BaseModel):
    full_name: str
    national_id: str
    birth_date: date
    grade_level: str
    address: str | None = None
    guardian_name: str
    guardian_phone: str
    classroom_id: int | None = None
    guardian_user_id: int | None = None


class StudentUpdate(BaseModel):
    full_name: str | None = None
    grade_level: str | None = None
    address: str | None = None
    guardian_name: str | None = None
    guardian_phone: str | None = None
    classroom_id: int | None = None
    guardian_user_id: int | None = None
    status: StudentStatus | None = None


class StudentRead(BaseModel):
    id: int
    full_name: str
    national_id: str
    birth_date: date
    grade_level: str
    address: str | None = None
    guardian_name: str
    guardian_phone: str
    status: StudentStatus
    classroom_id: int | None = None
    guardian_user_id: int | None = None
    created_at: datetime
    class_name: str | None = None


class StudentListResponse(BaseModel):
    items: list[StudentRead]
    total: int
