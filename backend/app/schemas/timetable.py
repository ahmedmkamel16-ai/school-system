from pydantic import BaseModel, Field

from app.models.timetable import Weekday


class TimetableSlotUpsert(BaseModel):
    classroom_id: int
    day: Weekday
    period_number: int = Field(ge=1, le=7)
    subject_id: int
    teacher_id: int
    force: bool = False


class TimetableSlotRead(BaseModel):
    id: int
    classroom_id: int
    day: Weekday
    period_number: int
    subject_id: int
    teacher_id: int
    subject_name: str | None = None
    teacher_name: str | None = None
    classroom_name: str | None = None


class TimetableGenerateResult(BaseModel):
    created: int
    warnings: list[str]
