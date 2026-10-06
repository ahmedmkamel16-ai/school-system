from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.core.audit import log_action
from app.core.deps import CurrentUser, SessionDep
from app.core.permissions import AcademicWritePermission
from app.models.curriculum import CurriculumRequirement
from app.models.subject import Subject
from app.schemas.curriculum import CurriculumRequirementRead, CurriculumRequirementUpsert

router = APIRouter(prefix="/curriculum", tags=["curriculum"])


def _to_read(requirement: CurriculumRequirement, session: SessionDep) -> CurriculumRequirementRead:
    subject = session.get(Subject, requirement.subject_id)
    return CurriculumRequirementRead(
        **requirement.model_dump(),
        subject_name=subject.name if subject else None,
    )


@router.get("", response_model=list[CurriculumRequirementRead])
def list_curriculum(
    session: SessionDep,
    _: CurrentUser,
    grade_level: str | None = Query(default=None),
) -> list[CurriculumRequirementRead]:
    query = select(CurriculumRequirement)
    if grade_level:
        query = query.where(CurriculumRequirement.grade_level == grade_level)
    requirements = session.exec(query).all()
    return [_to_read(r, session) for r in requirements]


@router.post("", response_model=CurriculumRequirementRead, status_code=status.HTTP_201_CREATED)
def upsert_curriculum(
    payload: CurriculumRequirementUpsert, session: SessionDep, current_user: AcademicWritePermission
) -> CurriculumRequirementRead:
    existing = session.exec(
        select(CurriculumRequirement).where(
            CurriculumRequirement.grade_level == payload.grade_level,
            CurriculumRequirement.subject_id == payload.subject_id,
        )
    ).first()
    if existing:
        existing.periods_per_week = payload.periods_per_week
        session.add(existing)
        session.commit()
        session.refresh(existing)
        requirement = existing
    else:
        requirement = CurriculumRequirement.model_validate(payload)
        session.add(requirement)
        session.commit()
        session.refresh(requirement)

    log_action(
        session, current_user, "update", "curriculum", requirement.id,
        f"حدّث منهج {payload.grade_level}",
    )
    return _to_read(requirement, session)


@router.delete("/{requirement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_curriculum(requirement_id: int, session: SessionDep, current_user: AcademicWritePermission) -> None:
    requirement = session.get(CurriculumRequirement, requirement_id)
    if not requirement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="غير موجود")
    session.delete(requirement)
    session.commit()
    log_action(session, current_user, "delete", "curriculum", requirement_id, "حذف متطلب منهج")
