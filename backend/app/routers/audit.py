from fastapi import APIRouter, Query
from sqlmodel import select

from app.core.deps import SessionDep
from app.core.permissions import ManageUsersPermission
from app.models.audit import AuditLog
from app.schemas.audit import AuditLogRead

router = APIRouter(prefix="/audit-log", tags=["audit"])


@router.get("", response_model=list[AuditLogRead])
def list_audit_log(
    session: SessionDep,
    _: ManageUsersPermission,
    limit: int = Query(default=100, le=500),
) -> list[AuditLog]:
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    return list(session.exec(query).all())
