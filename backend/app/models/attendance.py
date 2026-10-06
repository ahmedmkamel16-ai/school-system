from datetime import date
from enum import Enum

from sqlmodel import Field, SQLModel, UniqueConstraint


class AttendanceStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    LEFT_EARLY = "left_early"


class Attendance(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("student_id", "attendance_date"),)

    id: int | None = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="student.id", index=True)
    attendance_date: date = Field(index=True)
    status: AttendanceStatus
    note: str | None = Field(default=None)
    recorded_by_user_id: int | None = Field(default=None, foreign_key="user.id")
