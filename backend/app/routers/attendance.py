from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.core.audit import log_action
from app.core.deps import CurrentUser, SessionDep
from app.core.scoping import visible_student_ids
from app.models.attendance import Attendance, AttendanceStatus
from app.models.classroom import ClassRoom
from app.models.student import Student
from app.models.user import UserRole
from app.schemas.attendance import AttendanceRead, AttendanceUpsert

router = APIRouter(prefix="/attendance", tags=["attendance"])

STATUS_LABELS_AR = {
    AttendanceStatus.PRESENT: "حاضر",
    AttendanceStatus.ABSENT: "غائب",
    AttendanceStatus.LATE: "متأخر",
    AttendanceStatus.LEFT_EARLY: "غادر مبكرًا",
}


def _can_write_student(current_user, student: Student, session: SessionDep) -> bool:
    if current_user.role == UserRole.ADMIN or current_user.can_manage_users:
        return True
    if current_user.role == UserRole.TEACHER and current_user.teacher_id is not None:
        if student.classroom_id is None:
            return False
        classroom = session.get(ClassRoom, student.classroom_id)
        return bool(classroom and classroom.homeroom_teacher_id == current_user.teacher_id)
    return False


@router.get("", response_model=list[AttendanceRead])
def list_attendance(
    session: SessionDep,
    current_user: CurrentUser,
    student_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> list[Attendance]:
    visible_ids = visible_student_ids(current_user, session)
    if visible_ids is not None and not visible_ids:
        return []

    query = select(Attendance)
    if student_id is not None:
        if visible_ids is not None and student_id not in visible_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="لا تملك صلاحية عرض هذا الطالب"
            )
        query = query.where(Attendance.student_id == student_id)
    elif visible_ids is not None:
        query = query.where(Attendance.student_id.in_(visible_ids))
    if date_from:
        query = query.where(Attendance.attendance_date >= date_from)
    if date_to:
        query = query.where(Attendance.attendance_date <= date_to)
    return list(session.exec(query).all())


@router.post("", response_model=AttendanceRead, status_code=status.HTTP_201_CREATED)
def upsert_attendance(
    payload: AttendanceUpsert, session: SessionDep, current_user: CurrentUser
) -> Attendance:
    student = session.get(Student, payload.student_id)
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الطالب غير موجود")
    if not _can_write_student(current_user, student, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="لا تملك صلاحية تسجيل حضور هذا الطالب",
        )

    existing = session.exec(
        select(Attendance).where(
            Attendance.student_id == payload.student_id,
            Attendance.attendance_date == payload.attendance_date,
        )
    ).first()
    if existing:
        existing.status = payload.status
        existing.note = payload.note
        existing.recorded_by_user_id = current_user.id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        log_action(
            session, current_user, "update", "attendance", existing.id,
            f"سجّل حضور {student.full_name} بتاريخ {payload.attendance_date} كـ {STATUS_LABELS_AR[payload.status]}",
        )
        return existing

    record = Attendance(
        student_id=payload.student_id,
        attendance_date=payload.attendance_date,
        status=payload.status,
        note=payload.note,
        recorded_by_user_id=current_user.id,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    log_action(
        session, current_user, "create", "attendance", record.id,
        f"سجّل حضور {student.full_name} بتاريخ {payload.attendance_date}: {payload.status.value}",
    )
    return record
