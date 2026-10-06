from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select

from app.core.audit import log_action
from app.core.config import settings
from app.core.deps import CurrentUser, OptionalCurrentUser, SessionDep
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User, UserRole
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead)
def register(
    user_in: UserCreate, session: SessionDep, current_user: OptionalCurrentUser
) -> User:
    is_bootstrap = session.exec(select(User)).first() is None

    if is_bootstrap and not settings.ALLOW_BOOTSTRAP_REGISTRATION:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="التسجيل الأولي معطّل؛ أنشئ المدير الأول بالأمر: python scripts/create_admin.py",
        )
    if is_bootstrap:
        role = UserRole.ADMIN
        can_manage_users = True
        teacher_id = None
    else:
        if current_user is None or (
            current_user.role != UserRole.ADMIN and not current_user.can_manage_users
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="لا تملك صلاحية إنشاء حسابات جديدة",
            )
        if user_in.role == UserRole.ADMIN and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="فقط المدير يمكنه إنشاء حساب مدير آخر",
            )
        if user_in.can_manage_users and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="فقط المدير يمكنه منح صلاحية إدارة المستخدمين",
            )
        role = user_in.role
        can_manage_users = user_in.can_manage_users
        teacher_id = user_in.teacher_id

    existing = session.exec(select(User).where(User.email == user_in.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="البريد الإلكتروني مستخدم بالفعل",
        )
    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=hash_password(user_in.password),
        role=role,
        can_manage_users=can_manage_users,
        teacher_id=teacher_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    if current_user is not None:
        log_action(session, current_user, "create", "user", user.id, f"أنشأ حساب {user.full_name} ({role.value})")
    return user


@router.post("/login", response_model=Token)
def login(
    session: SessionDep,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="البريد الإلكتروني أو كلمة المرور غير صحيحة",
        )
    return Token(access_token=create_access_token(subject=user.email))


@router.get("/me", response_model=UserRead)
def read_current_user(current_user: CurrentUser) -> User:
    return current_user
