from sqlmodel import Session, select

from app.models.classroom import ClassRoom
from app.models.student import Student
from app.models.user import User, UserRole


def visible_classroom_ids(current_user: User, session: Session) -> set[int] | None:
    """None means no restriction (can see all classrooms)."""
    if current_user.role == UserRole.PARENT:
        # ولي الأمر يرى فقط شعب أبنائه (لا جداول ولا بيانات شعب غيرهم)
        return {
            cid
            for cid in session.exec(
                select(Student.classroom_id).where(Student.guardian_user_id == current_user.id)
            ).all()
            if cid is not None
        }
    if current_user.role == UserRole.TEACHER and not current_user.can_manage_users:
        if current_user.teacher_id is None:
            return set()
        return set(
            session.exec(
                select(ClassRoom.id).where(
                    ClassRoom.homeroom_teacher_id == current_user.teacher_id
                )
            ).all()
        )
    return None


def visible_student_ids(current_user: User, session: Session) -> set[int] | None:
    """None means no restriction (can see all students)."""
    if current_user.role == UserRole.PARENT:
        return set(
            session.exec(
                select(Student.id).where(Student.guardian_user_id == current_user.id)
            ).all()
        )
    classroom_ids = visible_classroom_ids(current_user, session)
    if classroom_ids is None:
        return None
    if not classroom_ids:
        return set()
    return set(
        session.exec(
            select(Student.id).where(Student.classroom_id.in_(classroom_ids))
        ).all()
    )
