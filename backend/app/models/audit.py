from datetime import datetime

from sqlmodel import Field, SQLModel


class AuditLog(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int | None = Field(default=None, foreign_key="user.id")
    actor_name: str
    action: str
    entity_type: str
    entity_id: int | None = None
    description: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
