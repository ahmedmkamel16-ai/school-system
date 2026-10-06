from datetime import date

from pydantic import BaseModel

from app.models.teacher_attendance import TeacherAttendanceStatus


class TeacherAttendanceUpsert(BaseModel):
    teacher_id: int
    attendance_date: date
    status: TeacherAttendanceStatus
    note: str | None = None


class TeacherAttendanceRead(BaseModel):
    teacher_id: int
    teacher_name: str
    attendance_date: date
    status: TeacherAttendanceStatus
    note: str | None = None
