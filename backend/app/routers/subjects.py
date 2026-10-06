from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.core.audit import log_action
from app.core.deps import CurrentUser, SessionDep
from app.core.permissions import AcademicWritePermission
from app.models.subject import Subject
from app.schemas.subject import SubjectCreate, SubjectRead

router = APIRouter(prefix="/subjects", tags=["subjects"])


@router.get("", response_model=list[SubjectRead])
def list_subjects(session: SessionDep, _: CurrentUser) -> list[Subject]:
    return list(session.exec(select(Subject)).all())


@router.post("", response_model=SubjectRead, status_code=status.HTTP_201_CREATED)
def create_subject(
    subject_in: SubjectCreate, session: SessionDep, current_user: AcademicWritePermission
) -> Subject:
    existing = session.exec(select(Subject).where(Subject.name == subject_in.name)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="المادة موجودة بالفعل")
    subject = Subject.model_validate(subject_in)
    session.add(subject)
    session.commit()
    session.refresh(subject)
    log_action(session, current_user, "create", "subject", subject.id, f"أضاف مادة {subject.name}")
    return subject


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(subject_id: int, session: SessionDep, current_user: AcademicWritePermission) -> None:
    subject = session.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="المادة غير موجودة")
    name = subject.name
    session.delete(subject)
    session.commit()
    log_action(session, current_user, "delete", "subject", subject_id, f"حذف مادة {name}")
