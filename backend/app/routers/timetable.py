import io

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import select

from app.core.audit import log_action
from app.core.deps import CurrentUser, SessionDep
from app.core.permissions import AcademicWritePermission
from app.core.scoping import visible_classroom_ids
from app.core.timetable_generator import generate_timetable
from app.models.classroom import ClassRoom
from app.models.subject import Subject
from app.models.teacher import Teacher
from app.models.timetable import TimetableSlot, Weekday
from app.schemas.timetable import (
    TimetableGenerateResult,
    TimetableSlotRead,
    TimetableSlotUpsert,
)

PERIODS = range(1, 8)

router = APIRouter(prefix="/timetable", tags=["timetable"])

WEEKDAY_LABELS_AR = {
    Weekday.SUNDAY: "الأحد",
    Weekday.MONDAY: "الاثنين",
    Weekday.TUESDAY: "الثلاثاء",
    Weekday.WEDNESDAY: "الأربعاء",
    Weekday.THURSDAY: "الخميس",
}


def _to_read(slot: TimetableSlot, session: SessionDep) -> TimetableSlotRead:
    subject = session.get(Subject, slot.subject_id)
    teacher = session.get(Teacher, slot.teacher_id)
    classroom = session.get(ClassRoom, slot.classroom_id)
    return TimetableSlotRead(
        **slot.model_dump(),
        subject_name=subject.name if subject else None,
        teacher_name=teacher.full_name if teacher else None,
        classroom_name=classroom.name if classroom else None,
    )


@router.get("", response_model=list[TimetableSlotRead])
def list_timetable(
    session: SessionDep,
    current_user: CurrentUser,
    classroom_id: int | None = Query(default=None),
    teacher_id: int | None = Query(default=None),
) -> list[TimetableSlotRead]:
    if not classroom_id and not teacher_id:
        if current_user.role.value != "admin" and not current_user.can_manage_users:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="يجب تحديد classroom_id أو teacher_id",
            )
        slots = session.exec(select(TimetableSlot)).all()
        return [_to_read(slot, session) for slot in slots]

    query = select(TimetableSlot)
    if classroom_id:
        visible_ids = visible_classroom_ids(current_user, session)
        if visible_ids is not None and classroom_id not in visible_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الشعبة غير موجودة")
        query = query.where(TimetableSlot.classroom_id == classroom_id)
    if teacher_id:
        if current_user.role.value == "teacher" and current_user.teacher_id != teacher_id and not current_user.can_manage_users:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="لا تملك صلاحية عرض جدول معلم آخر"
            )
        query = query.where(TimetableSlot.teacher_id == teacher_id)

    slots = session.exec(query).all()
    return [_to_read(slot, session) for slot in slots]


@router.get("/export")
def export_timetable(session: SessionDep, current_user: CurrentUser) -> StreamingResponse:
    if current_user.role.value != "admin" and not current_user.can_manage_users:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="لا تملك صلاحية تصدير الجدول الكلي",
        )
    classrooms = session.exec(select(ClassRoom)).all()
    slots = session.exec(select(TimetableSlot)).all()
    subjects_map = {s.id: s.name for s in session.exec(select(Subject)).all()}
    teachers_map = {t.id: t.full_name for t in session.exec(select(Teacher)).all()}
    slot_by_key = {(s.classroom_id, s.day, s.period_number): s for s in slots}

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "الجدول الكلي"
    sheet.append(["اليوم", "الحصة"] + [c.name for c in classrooms])
    for day in Weekday:
        for period in PERIODS:
            row = [WEEKDAY_LABELS_AR[day], period]
            for classroom in classrooms:
                slot = slot_by_key.get((classroom.id, day, period))
                if slot:
                    subject_name = subjects_map.get(slot.subject_id, "")
                    teacher_name = teachers_map.get(slot.teacher_id, "")
                    row.append(f"{subject_name} - {teacher_name}")
                else:
                    row.append("")
            sheet.append(row)
    sheet.sheet_view.rightToLeft = True

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=school_timetable.xlsx"},
    )


@router.post("", response_model=TimetableSlotRead, status_code=status.HTTP_201_CREATED)
def upsert_timetable_slot(
    payload: TimetableSlotUpsert, session: SessionDep, current_user: AcademicWritePermission
) -> TimetableSlotRead:
    if not payload.force:
        conflict = session.exec(
            select(TimetableSlot).where(
                TimetableSlot.teacher_id == payload.teacher_id,
                TimetableSlot.day == payload.day,
                TimetableSlot.period_number == payload.period_number,
                TimetableSlot.classroom_id != payload.classroom_id,
            )
        ).first()
        if conflict:
            teacher = session.get(Teacher, payload.teacher_id)
            conflict_classroom = session.get(ClassRoom, conflict.classroom_id)
            conflict_subject = session.get(Subject, conflict.subject_id)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"المعلم {teacher.full_name if teacher else ''} لديه حصة أخرى "
                    f"يوم {WEEKDAY_LABELS_AR[payload.day]} في الحصة {payload.period_number} "
                    f"بشعبة {conflict_classroom.name if conflict_classroom else '?'} "
                    f"(مادة {conflict_subject.name if conflict_subject else '?'})"
                ),
            )

    existing = session.exec(
        select(TimetableSlot).where(
            TimetableSlot.classroom_id == payload.classroom_id,
            TimetableSlot.day == payload.day,
            TimetableSlot.period_number == payload.period_number,
        )
    ).first()
    if existing:
        existing.subject_id = payload.subject_id
        existing.teacher_id = payload.teacher_id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        slot = existing
    else:
        slot = TimetableSlot(**payload.model_dump(exclude={"force"}))
        session.add(slot)
        session.commit()
        session.refresh(slot)

    log_action(
        session, current_user, "update", "timetable", slot.id,
        f"حدّث الجدول: {payload.day.value} حصة {payload.period_number}",
    )
    return _to_read(slot, session)


@router.post("/generate", response_model=TimetableGenerateResult)
def generate_timetable_endpoint(
    session: SessionDep, current_user: AcademicWritePermission
) -> TimetableGenerateResult:
    created, warnings = generate_timetable(session)
    log_action(
        session, current_user, "update", "timetable", None,
        f"توليد الجدول تلقائيًا ({created} حصة جديدة)",
    )
    return TimetableGenerateResult(created=created, warnings=warnings)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_classroom_timetable(
    session: SessionDep,
    current_user: AcademicWritePermission,
    classroom_id: int = Query(...),
) -> None:
    classroom = session.get(ClassRoom, classroom_id)
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الشعبة غير موجودة")
    slots = session.exec(
        select(TimetableSlot).where(TimetableSlot.classroom_id == classroom_id)
    ).all()
    count = len(slots)
    for slot in slots:
        session.delete(slot)
    session.commit()
    log_action(
        session, current_user, "delete", "timetable", None,
        f"مسح جدول شعبة {classroom.name} بالكامل ({count} حصة)",
    )


@router.delete("/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_timetable_slot(slot_id: int, session: SessionDep, current_user: AcademicWritePermission) -> None:
    slot = session.get(TimetableSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الحصة غير موجودة")
    session.delete(slot)
    session.commit()
    log_action(session, current_user, "delete", "timetable", slot_id, "حذف حصة من الجدول")
