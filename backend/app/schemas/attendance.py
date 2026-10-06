from datetime import date

from pydantic import BaseModel

from app.models.attendance import AttendanceStatus


class AttendanceUpsert(BaseModel):
    student_id: int
    attendance_date: date
    status: AttendanceStatus
    note: str | None = None


class AttendanceRead(BaseModel):
    id: int
    student_id: int
    attendance_date: date
    status: AttendanceStatus
    note: str | None = None
    recorded_by_user_id: int | None = None
