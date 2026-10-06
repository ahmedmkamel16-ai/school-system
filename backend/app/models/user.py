from enum import Enum

from sqlmodel import Field, SQLModel


class UserRole(str, Enum):
    ADMIN = "admin"
    TEACHER = "teacher"
    ACCOUNTANT = "accountant"
    PARENT = "parent"


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str
    hashed_password: str
    role: UserRole = Field(default=UserRole.PARENT)
    is_active: bool = Field(default=True)
    can_manage_users: bool = Field(default=False)
    teacher_id: int | None = Field(default=None, foreign_key="teacher.id")
