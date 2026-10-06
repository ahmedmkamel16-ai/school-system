from enum import Enum

from sqlmodel import Field, Relationship, SQLModel, UniqueConstraint


class TeacherStatus(str, Enum):
    ACTIVE = "active"
    ON_LEAVE = "on_leave"
    INACTIVE = "inactive"


class Teacher(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    full_name: str
    email: str = Field(unique=True, index=True)
    phone: str
    status: TeacherStatus = Field(default=TeacherStatus.ACTIVE)
    max_periods_per_week: int = Field(default=24)

    classrooms: list["ClassRoom"] = Relationship(back_populates="homeroom_teacher")


class TeacherSubject(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("teacher_id", "subject_id", name="uq_teacher_subject"),
    )

    id: int | None = Field(default=None, primary_key=True)
    teacher_id: int = Field(foreign_key="teacher.id", index=True)
    subject_id: int = Field(foreign_key="subject.id", index=True)


class TeacherGrade(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("teacher_id", "grade_level", name="uq_teacher_grade"),
    )

    id: int | None = Field(default=None, primary_key=True)
    teacher_id: int = Field(foreign_key="teacher.id", index=True)
    grade_level: str = Field(index=True)
