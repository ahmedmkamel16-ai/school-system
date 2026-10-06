from sqlmodel import Field, SQLModel, UniqueConstraint


class CurriculumRequirement(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("grade_level", "subject_id", name="uq_curriculum_grade_subject"),
    )

    id: int | None = Field(default=None, primary_key=True)
    grade_level: str = Field(index=True)
    subject_id: int = Field(foreign_key="subject.id", index=True)
    periods_per_week: int = Field(ge=1, le=35)
