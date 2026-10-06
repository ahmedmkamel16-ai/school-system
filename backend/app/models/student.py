from datetime import date, datetime
from enum import Enum

from sqlmodel import Field, Relationship, SQLModel


class StudentStatus(str, Enum):
    ACTIVE = "active"
    LISTENER = "listener"
    SUSPENDED = "suspended"
    TRANSFERRED = "transferred"


class Student(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    full_name: str
    national_id: str = Field(unique=True, index=True)
    birth_date: date
    grade_level: str
    address: str | None = Field(default=None)
    guardian_name: str
    guardian_phone: str
    status: StudentStatus = Field(default=StudentStatus.ACTIVE)
    classroom_id: int | None = Field(default=None, foreign_key="classroom.id")
    guardian_user_id: int | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    classroom: "ClassRoom" = Relationship(back_populates="students")
