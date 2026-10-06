from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AuditMixin(SQLModel):
    """حقول التدقيق المشتركة. تُملأ من الخادم فقط (المستخدم الحالي من JWT)."""

    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True), nullable=False)
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"onupdate": utcnow},
        nullable=False,
    )
    created_by: int = Field(foreign_key="user.id", index=True, nullable=False)
    updated_by: int | None = Field(default=None, foreign_key="user.id")
