from pydantic import BaseModel, Field

from app.models.user import UserRole


class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: UserRole = UserRole.PARENT
    can_manage_users: bool = False
    teacher_id: int | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    can_manage_users: bool | None = None
    teacher_id: int | None = None


class UserPasswordReset(BaseModel):
    password: str = Field(min_length=6)


class UserRead(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    can_manage_users: bool
    teacher_id: int | None = None
