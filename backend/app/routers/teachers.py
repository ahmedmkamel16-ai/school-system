from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.core.audit import log_action
from app.core.deps import SessionDep
from app.core.permissions import AcademicWritePermission, StaffDirectoryReadPermission
from app.models.teacher import Teacher, TeacherGrade, TeacherStatus, TeacherSubject
from app.schemas.teacher import TeacherCreate, TeacherRead, TeacherUpdate

router = APIRouter(prefix="/teachers", tags=["teachers"])


def _to_read(teacher: Teacher, session: SessionDep) -> TeacherRead:
    subject_ids = [
        ts.subject_id
        for ts in session.exec(
            select(TeacherSubject).where(TeacherSubject.teacher_id == teacher.id)
        ).all()
    ]
    grade_levels = [
        tg.grade_level
        for tg in session.exec(
            select(TeacherGrade).where(TeacherGrade.teacher_id == teacher.id)
        ).all()
    ]
    return TeacherRead(**teacher.model_dump(), subject_ids=subject_ids, grade_levels=grade_levels)


def _sync_subjects(teacher_id: int, subject_ids: list[int], session: SessionDep) -> None:
    existing = session.exec(
        select(TeacherSubject).where(TeacherSubject.teacher_id == teacher_id)
    ).all()
    existing_ids = {ts.subject_id for ts in existing}
    new_ids = set(subject_ids)
    for ts in existing:
        if ts.subject_id not in new_ids:
            session.delete(ts)
    for subject_id in new_ids - existing_ids:
        session.add(TeacherSubject(teacher_id=teacher_id, subject_id=subject_id))
    session.commit()


def _sync_grades(teacher_id: int, grade_levels: list[str], session: SessionDep) -> None:
    existing = session.exec(
        select(TeacherGrade).where(TeacherGrade.teacher_id == teacher_id)
    ).all()
    existing_grades = {tg.grade_level for tg in existing}
    new_grades = set(grade_levels)
    for tg in existing:
        if tg.grade_level not in new_grades:
            session.delete(tg)
    for grade_level in new_grades - existing_grades:
        session.add(TeacherGrade(teacher_id=teacher_id, grade_level=grade_level))
    session.commit()


@router.get("", response_model=list[TeacherRead])
def list_teachers(
    session: SessionDep,
    _: StaffDirectoryReadPermission,
    teacher_status: TeacherStatus | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
) -> list[TeacherRead]:
    query = select(Teacher)
    if teacher_status:
        query = query.where(Teacher.status == teacher_status)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            (Teacher.full_name.like(pattern)) | (Teacher.email.like(pattern))
        )
    teachers = session.exec(query).all()
    return [_to_read(t, session) for t in teachers]


@router.post("", response_model=TeacherRead, status_code=status.HTTP_201_CREATED)
def create_teacher(
    teacher_in: TeacherCreate, session: SessionDep, current_user: AcademicWritePermission
) -> TeacherRead:
    existing = session.exec(
        select(Teacher).where(Teacher.email == teacher_in.email)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="البريد الإلكتروني مسجل بالفعل",
        )
    teacher_data = teacher_in.model_dump(exclude={"subject_ids", "grade_levels"})
    teacher = Teacher(**teacher_data)
    session.add(teacher)
    session.commit()
    session.refresh(teacher)
    _sync_subjects(teacher.id, teacher_in.subject_ids, session)
    _sync_grades(teacher.id, teacher_in.grade_levels, session)
    log_action(session, current_user, "create", "teacher", teacher.id, f"أضاف المعلم {teacher.full_name}")
    return _to_read(teacher, session)


@router.patch("/{teacher_id}", response_model=TeacherRead)
def update_teacher(
    teacher_id: int, teacher_in: TeacherUpdate, session: SessionDep, current_user: AcademicWritePermission
) -> TeacherRead:
    teacher = session.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="المعلم غير موجود")
    if teacher_in.email and teacher_in.email != teacher.email:
        existing = session.exec(
            select(Teacher).where(Teacher.email == teacher_in.email, Teacher.id != teacher_id)
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="البريد الإلكتروني مسجل بالفعل لمعلم آخر",
            )
    update_data = teacher_in.model_dump(exclude_unset=True, exclude={"subject_ids", "grade_levels"})
    for field, value in update_data.items():
        setattr(teacher, field, value)
    session.add(teacher)
    session.commit()
    session.refresh(teacher)
    if teacher_in.subject_ids is not None:
        _sync_subjects(teacher.id, teacher_in.subject_ids, session)
    if teacher_in.grade_levels is not None:
        _sync_grades(teacher.id, teacher_in.grade_levels, session)
    log_action(session, current_user, "update", "teacher", teacher.id, f"عدّل بيانات المعلم {teacher.full_name}")
    return _to_read(teacher, session)


@router.delete("/{teacher_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_teacher(teacher_id: int, session: SessionDep, current_user: AcademicWritePermission) -> None:
    teacher = session.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="المعلم غير موجود")
    full_name = teacher.full_name
    session.delete(teacher)
    session.commit()
    log_action(session, current_user, "delete", "teacher", teacher_id, f"حذف المعلم {full_name}")
