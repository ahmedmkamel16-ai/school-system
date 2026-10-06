from pydantic import BaseModel, Field


class CurriculumRequirementUpsert(BaseModel):
    grade_level: str
    subject_id: int
    periods_per_week: int = Field(ge=1, le=35)


class CurriculumRequirementRead(BaseModel):
    id: int
    grade_level: str
    subject_id: int
    periods_per_week: int
    subject_name: str | None = None
