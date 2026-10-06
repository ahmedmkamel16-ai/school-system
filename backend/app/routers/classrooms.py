from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.core.audit import log_action
from app.core.deps import CurrentUser, SessionDep
from app.core.permissions import AcademicWritePermission
from app.core.scoping import visible_classroom_ids
from app.models.classroom import ClassRoom
from app.schemas.classroom import ClassRoomCreate, ClassRoomRead, ClassRoomUpdate

router = APIRouter(prefix="/classes", tags=["classes"])


@router.get("", response_model=list[ClassRoomRead])
def list_classrooms(
    session: SessionDep,
    current_user: CurrentUser,
    grade_level: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> list[ClassRoom]:
    visible_ids = visible_classroom_ids(current_user, session)
    if visible_ids is not None and not visible_ids:
        return []

    query = select(ClassRoom)
    if visible_ids is not None:
        query = query.where(ClassRoom.id.in_(visible_ids))
    if grade_level:
        query = query.where(ClassRoom.grade_level == grade_level)
    if search:
        query = query.where(ClassRoom.name.like(f"%{search}%"))
    return list(session.exec(query).all())


@router.post("", response_model=ClassRoomRead, status_code=status.HTTP_201_CREATED)
def create_classroom(
    classroom_in: ClassRoomCreate, session: SessionDep, current_user: AcademicWritePermission
) -> ClassRoom:
    classroom = ClassRoom.model_validate(classroom_in)
    session.add(classroom)
    session.commit()
    session.refresh(classroom)
    log_action(session, current_user, "create", "classroom", classroom.id, f"أضاف الشعبة {classroom.name}")
    return classroom


@router.patch("/{classroom_id}", response_model=ClassRoomRead)
def update_classroom(
    classroom_id: int,
    classroom_in: ClassRoomUpdate,
    session: SessionDep,
    current_user: AcademicWritePermission,
) -> ClassRoom:
    classroom = session.get(ClassRoom, classroom_id)
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الشعبة غير موجودة")
    for field, value in classroom_in.model_dump(exclude_unset=True).items():
        setattr(classroom, field, value)
    session.add(classroom)
    session.commit()
    session.refresh(classroom)
    log_action(session, current_user, "update", "classroom", classroom.id, f"عدّل بيانات الشعبة {classroom.name}")
    return classroom


@router.delete("/{classroom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_classroom(classroom_id: int, session: SessionDep, current_user: AcademicWritePermission) -> None:
    classroom = session.get(ClassRoom, classroom_id)
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الشعبة غير موجودة")
    name = classroom.name
    session.delete(classroom)
    session.commit()
    log_action(session, current_user, "delete", "classroom", classroom_id, f"حذف الشعبة {name}")
