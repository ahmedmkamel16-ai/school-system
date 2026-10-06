from enum import Enum

from sqlmodel import Field, SQLModel, UniqueConstraint


class Weekday(str, Enum):
    SUNDAY = "sunday"
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"


class TimetableSlot(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("classroom_id", "day", "period_number"),)

    id: int | None = Field(default=None, primary_key=True)
    classroom_id: int = Field(foreign_key="classroom.id", index=True)
    day: Weekday
    period_number: int
    subject_id: int = Field(foreign_key="subject.id")
    teacher_id: int = Field(foreign_key="teacher.id", index=True)
