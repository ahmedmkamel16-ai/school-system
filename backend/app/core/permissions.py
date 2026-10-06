from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.core.deps import CurrentUser
from app.models.user import User, UserRole


def require_manage_users(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.ADMIN and not current_user.can_manage_users:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="لا تملك صلاحية إدارة المستخدمين",
        )
    return current_user


def require_admin(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="هذا الإجراء يتطلب صلاحية المدير",
        )
    return current_user


def require_academic_write(current_user: CurrentUser) -> User:
    """Creating/editing/deleting students, teachers, and classes."""
    if current_user.role != UserRole.ADMIN and not current_user.can_manage_users:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="لا تملك صلاحية تعديل هذه البيانات",
        )
    return current_user


ManageUsersPermission = Annotated[User, Depends(require_manage_users)]
AdminOnly = Annotated[User, Depends(require_admin)]
def require_staff_directory_read(current_user: CurrentUser) -> User:
    """Viewing the teacher directory (out of scope for parent accounts)."""
    if current_user.role == UserRole.PARENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="لا تملك صلاحية عرض قائمة المعلمين",
        )
    return current_user


AcademicWritePermission = Annotated[User, Depends(require_academic_write)]
StaffDirectoryReadPermission = Annotated[User, Depends(require_staff_directory_read)]
