from sqlmodel import Field, Relationship, SQLModel


class ClassRoom(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    grade_level: str
    academic_year: str
    homeroom_teacher_id: int | None = Field(default=None, foreign_key="teacher.id")

    homeroom_teacher: "Teacher" = Relationship(back_populates="classrooms")
    students: list["Student"] = Relationship(back_populates="classroom")
