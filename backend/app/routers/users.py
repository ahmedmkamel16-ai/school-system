from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.core.audit import log_action
from app.core.permissions import ManageUsersPermission
from app.core.deps import SessionDep
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserPasswordReset, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(session: SessionDep, _: ManageUsersPermission) -> list[User]:
    return list(session.exec(select(User)).all())


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    user_in: UserUpdate,
    session: SessionDep,
    current_user: ManageUsersPermission,
) -> User:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="المستخدم غير موجود")

    updates = user_in.model_dump(exclude_unset=True)

    if ("can_manage_users" in updates or updates.get("role") == UserRole.ADMIN) and (
        current_user.role != UserRole.ADMIN
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="فقط المدير يمكنه تعديل صلاحية إدارة المستخدمين أو منح دور المدير",
        )

    for field, value in updates.items():
        setattr(user, field, value)
    session.add(user)
    session.commit()
    session.refresh(user)
    log_action(session, current_user, "update", "user", user.id, f"عدّل بيانات المستخدم {user.full_name}")
    return user


@router.post("/{user_id}/reset-password", response_model=UserRead)
def reset_password(
    user_id: int,
    payload: UserPasswordReset,
    session: SessionDep,
    current_user: ManageUsersPermission,
) -> User:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="المستخدم غير موجود")
    if user.role == UserRole.ADMIN and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="فقط المدير يمكنه إعادة تعيين كلمة مرور مدير آخر",
        )
    user.hashed_password = hash_password(payload.password)
    session.add(user)
    session.commit()
    session.refresh(user)
    log_action(session, current_user, "reset_password", "user", user.id, f"أعاد تعيين كلمة مرور {user.full_name}")
    return user
