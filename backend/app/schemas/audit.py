from datetime import datetime

from pydantic import BaseModel


class AuditLogRead(BaseModel):
    id: int
    user_id: int | None
    actor_name: str
    action: str
    entity_type: str
    entity_id: int | None
    description: str
    created_at: datetime
