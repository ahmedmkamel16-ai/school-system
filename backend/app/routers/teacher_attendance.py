from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.core.audit import log_action
from app.core.deps import CurrentUser, SessionDep
from app.core.permissions import AcademicWritePermission
from app.models.teacher import Teacher, TeacherStatus
from app.models.teacher_attendance import TeacherAttendance, TeacherAttendanceStatus
from app.models.user import UserRole
from app.schemas.teacher_attendance import TeacherAttendanceRead, TeacherAttendanceUpsert

router = APIRouter(prefix="/teacher-attendance", tags=["teacher-attendance"])

STATUS_LABELS_AR = {
    TeacherAttendanceStatus.PRESENT: "حاضر",
    TeacherAttendanceStatus.ABSENT: "غائب",
    TeacherAttendanceStatus.LEAVE: "إجازة",
}


@router.get("", response_model=list[TeacherAttendanceRead])
def list_teacher_attendance(
    session: SessionDep,
    current_user: CurrentUser,
    attendance_date: date | None = Query(default=None, alias="date"),
) -> list[TeacherAttendanceRead]:
    if current_user.role == UserRole.PARENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="لا تملك صلاحية عرض هذه البيانات")

    target_date = attendance_date or date.today()
    teachers = session.exec(
        select(Teacher).where(Teacher.status == TeacherStatus.ACTIVE)
    ).all()
    records = session.exec(
        select(TeacherAttendance).where(TeacherAttendance.attendance_date == target_date)
    ).all()
    record_by_teacher = {r.teacher_id: r for r in records}

    return [
        TeacherAttendanceRead(
            teacher_id=teacher.id,
            teacher_name=teacher.full_name,
            attendance_date=target_date,
            status=(
                record_by_teacher[teacher.id].status
                if teacher.id in record_by_teacher
                else TeacherAttendanceStatus.PRESENT
            ),
            note=record_by_teacher[teacher.id].note if teacher.id in record_by_teacher else None,
        )
        for teacher in teachers
    ]


@router.post("", response_model=TeacherAttendanceRead, status_code=status.HTTP_201_CREATED)
def upsert_teacher_attendance(
    payload: TeacherAttendanceUpsert, session: SessionDep, current_user: AcademicWritePermission
) -> TeacherAttendanceRead:
    teacher = session.get(Teacher, payload.teacher_id)
    if not teacher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="المعلم غير موجود")

    existing = session.exec(
        select(TeacherAttendance).where(
            TeacherAttendance.teacher_id == payload.teacher_id,
            TeacherAttendance.attendance_date == payload.attendance_date,
        )
    ).first()
    if existing:
        existing.status = payload.status
        existing.note = payload.note
        session.add(existing)
        session.commit()
        session.refresh(existing)
        record = existing
    else:
        record = TeacherAttendance(**payload.model_dump())
        session.add(record)
        session.commit()
        session.refresh(record)

    log_action(
        session, current_user, "update", "teacher_attendance", record.id,
        f"سجّل حضور المعلم {teacher.full_name} بتاريخ {payload.attendance_date} كـ {STATUS_LABELS_AR[payload.status]}",
    )
    return TeacherAttendanceRead(
        teacher_id=teacher.id,
        teacher_name=teacher.full_name,
        attendance_date=record.attendance_date,
        status=record.status,
        note=record.note,
    )
