from datetime import date
from enum import Enum

from sqlmodel import Field, SQLModel, UniqueConstraint


class TeacherAttendanceStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    LEAVE = "leave"


class TeacherAttendance(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("teacher_id", "attendance_date"),)

    id: int | None = Field(default=None, primary_key=True)
    teacher_id: int = Field(foreign_key="teacher.id", index=True)
    attendance_date: date = Field(index=True)
    status: TeacherAttendanceStatus
    note: str | None = Field(default=None)
