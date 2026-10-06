from pydantic import BaseModel


class ClassRoomCreate(BaseModel):
    name: str
    grade_level: str
    academic_year: str
    homeroom_teacher_id: int | None = None


class ClassRoomUpdate(BaseModel):
    name: str | None = None
    grade_level: str | None = None
    academic_year: str | None = None
    homeroom_teacher_id: int | None = None


class ClassRoomRead(BaseModel):
    id: int
    name: str
    grade_level: str
    academic_year: str
    homeroom_teacher_id: int | None = None
