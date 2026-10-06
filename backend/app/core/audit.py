from sqlmodel import Session

from app.models.audit import AuditLog
from app.models.user import User


def log_action(
    session: Session,
    user: User,
    action: str,
    entity_type: str,
    entity_id: int | None,
    description: str,
) -> None:
    entry = AuditLog(
        user_id=user.id,
        actor_name=user.full_name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
    )
    session.add(entry)
    session.commit()
