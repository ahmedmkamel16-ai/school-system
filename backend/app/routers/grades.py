"""مسارات الامتحانات والدرجات وكشوف الطلاب.

الصلاحيات:
  * المدير (أو المفوَّض بإدارة المستخدمين): كل شيء.
  * المعلم: ينشئ امتحانات ويدخل درجات لـ (فصل، مادة) منسوبَين له فقط، وبينما الامتحان مسودة.
  * المحاسب: قراءة كشوف الدرجات فقط.
  * ولي الأمر: كشوف أبنائه المنشورة فقط عبر المسار الخاص به.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import tuple_
from sqlmodel import func, select

from app.core.audit import log_action
from app.core.deps import CurrentUser, SessionDep
from app.core.finance import HOLD_MESSAGE, has_financial_hold
from app.core.grading import can_manage_exam, is_admin, teacher_scope_pairs, upsert_report_card
from app.core.scoping import visible_student_ids
from app.models.classroom import ClassRoom
from app.models.grades import (
    AcademicYear,
    Exam,
    ExamAssignment,
    ExamCreate,
    ExamDetailRead,
    ExamListRead,
    ExamRead,
    ExamResult,
    ExamStatus,
    ExamStatusChange,
    GradebookRow,
    GuardianReportCardList,
    GuardianReportCardRead,
    GuardianReportCardSummary,
    ReportCard,
    ReportCardEntry,
    ReportCardRead,
    ReportCardStatus,
    ResultBulkUpsert,
    ResultRead,
    ResultStatus,
    Term,
    assert_score_within_max,
    assert_weight_budget,
)
from app.models.student import Student, StudentStatus
from app.models.subject import Subject
from app.models.user import UserRole

router = APIRouter(tags=["grades"])

_ALLOWED_TRANSITIONS = {
    ExamStatus.DRAFT: {ExamStatus.PUBLISHED},
    ExamStatus.PUBLISHED: {ExamStatus.LOCKED},
    ExamStatus.LOCKED: set(),
}


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _get_exam_in_scope(session: SessionDep, user, exam_id) -> Exam:
    """404 لكل ما هو خارج النطاق (لا نكشف وجود الكائن لمن لا يملك صلاحيته)."""
    exam = session.get(Exam, exam_id)
    if exam is None or not can_manage_exam(session, user, exam.classroom_id, exam.subject_id):
        raise _not_found("الامتحان غير موجود")
    return exam


def _card_to_read(session: SessionDep, card: ReportCard, student: Student, model):
    entries = session.exec(
        select(ReportCardEntry).where(ReportCardEntry.report_card_id == card.id)
    ).all()
    names = (
        {
            s.id: s.name
            for s in session.exec(
                select(Subject).where(Subject.id.in_([e.subject_id for e in entries]))
            ).all()
        }
        if entries
        else {}
    )
    # ملاحظات المعلم الموجَّهة لولي الأمر فقط؛ internal_note لا تُقرأ هنا إطلاقًا.
    notes: dict[int, list[str]] = {}
    if entries and student.classroom_id is not None:
        for subject_id, title, note in session.exec(
            select(Exam.subject_id, Exam.title, ExamResult.teacher_note)
            .join(ExamResult, ExamResult.exam_id == Exam.id)
            .where(
                ExamResult.student_id == student.id,
                ExamResult.teacher_note.is_not(None),
                Exam.classroom_id == student.classroom_id,
                Exam.term == card.term,
                Exam.academic_year == card.academic_year,
                Exam.status.in_([ExamStatus.PUBLISHED, ExamStatus.LOCKED]),
            )
            .order_by(Exam.exam_date)
        ).all():
            notes.setdefault(subject_id, []).append(f"{title}: {note}")
    classroom = session.get(ClassRoom, student.classroom_id) if student.classroom_id else None
    data = {
        **card.model_dump(),
        "student_name": student.full_name,
        "classroom_name": classroom.name if classroom else None,
        "entries": [
            {
                "subject_id": e.subject_id,
                "subject_name": names.get(e.subject_id),
                "weighted_percentage": e.weighted_percentage,
                "notes": notes.get(e.subject_id, []),
            }
            for e in sorted(entries, key=lambda e: names.get(e.subject_id) or "")
        ],
    }
    return model.model_validate(data)


def _require_exam_reader(user) -> None:
    if not (is_admin(user) or user.role == UserRole.TEACHER):
        raise _forbidden("لا تملك صلاحية عرض الامتحانات")


def _to_list_items(session: SessionDep, exams: list[Exam]) -> list[ExamListRead]:
    if not exams:
        return []
    classroom_ids = {e.classroom_id for e in exams}
    subject_ids = {e.subject_id for e in exams}
    classroom_names = {
        c.id: c.name for c in session.exec(select(ClassRoom).where(ClassRoom.id.in_(classroom_ids))).all()
    }
    subject_names = {
        s.id: s.name for s in session.exec(select(Subject).where(Subject.id.in_(subject_ids))).all()
    }
    graded = dict(
        session.exec(
            select(ExamResult.exam_id, func.count())
            .where(ExamResult.exam_id.in_([e.id for e in exams]))
            .group_by(ExamResult.exam_id)
        ).all()
    )
    totals = dict(
        session.exec(
            select(Student.classroom_id, func.count())
            .where(
                Student.classroom_id.in_(classroom_ids),
                Student.status != StudentStatus.TRANSFERRED,
            )
            .group_by(Student.classroom_id)
        ).all()
    )
    return [
        ExamListRead.model_validate(
            {
                **e.model_dump(),
                "classroom_name": classroom_names.get(e.classroom_id),
                "subject_name": subject_names.get(e.subject_id),
                "students_count": totals.get(e.classroom_id, 0),
                "graded_count": graded.get(e.id, 0),
            }
        )
        for e in exams
    ]


# ---------------------------------------------------------------------------
# الامتحانات
# ---------------------------------------------------------------------------


@router.get("/exams", response_model=list[ExamListRead])
def list_exams(
    session: SessionDep,
    current_user: CurrentUser,
    class_id: int | None = Query(default=None),
    subject_id: int | None = Query(default=None),
    exam_status: ExamStatus | None = Query(default=None, alias="status"),
    term: Term | None = Query(default=None),
    academic_year: Annotated[AcademicYear | None, Query()] = None,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[ExamListRead]:
    """المدير يرى كل الامتحانات، والمعلم امتحانات (فصل، مادة) المنسوبة له فقط."""
    _require_exam_reader(current_user)
    query = select(Exam)
    if not is_admin(current_user):
        pairs = teacher_scope_pairs(session, current_user)
        if not pairs:
            return []
        query = query.where(tuple_(Exam.classroom_id, Exam.subject_id).in_(pairs))
    if class_id is not None:
        query = query.where(Exam.classroom_id == class_id)
    if subject_id is not None:
        query = query.where(Exam.subject_id == subject_id)
    if exam_status is not None:
        query = query.where(Exam.status == exam_status)
    if term is not None:
        query = query.where(Exam.term == term)
    if academic_year is not None:
        query = query.where(Exam.academic_year == academic_year)
    query = query.order_by(Exam.exam_date.desc(), Exam.title).offset(offset).limit(limit)
    return _to_list_items(session, list(session.exec(query).all()))


@router.get("/exams/assignments", response_model=list[ExamAssignment])
def list_assignments(session: SessionDep, current_user: CurrentUser) -> list[ExamAssignment]:
    """أزواج (فصل، مادة) المسموح إنشاء امتحانات لها — لتعبئة نموذج الإنشاء."""
    _require_exam_reader(current_user)
    classrooms = {c.id: c for c in session.exec(select(ClassRoom)).all()}
    subjects = {s.id: s for s in session.exec(select(Subject)).all()}
    if is_admin(current_user):
        pairs = {(c, s) for c in classrooms for s in subjects}
    else:
        pairs = {
            (c, s)
            for c, s in teacher_scope_pairs(session, current_user)
            if c in classrooms and s in subjects
        }
    return [
        ExamAssignment(
            classroom_id=c,
            classroom_name=classrooms[c].name,
            grade_level=classrooms[c].grade_level,
            academic_year=classrooms[c].academic_year,
            subject_id=s,
            subject_name=subjects[s].name,
        )
        for c, s in sorted(pairs, key=lambda p: (classrooms[p[0]].name, subjects[p[1]].name))
    ]


@router.get("/exams/{exam_id}", response_model=ExamDetailRead)
def get_exam(exam_id: uuid.UUID, session: SessionDep, current_user: CurrentUser) -> ExamDetailRead:
    """تفاصيل الامتحان + كل طلاب الفصل مع درجاتهم الحالية (دفتر الدرجات)."""
    exam = _get_exam_in_scope(session, current_user, exam_id)
    item = _to_list_items(session, [exam])[0]
    students = session.exec(
        select(Student)
        .where(Student.classroom_id == exam.classroom_id, Student.status != StudentStatus.TRANSFERRED)
        .order_by(Student.full_name)
    ).all()
    results = {
        r.student_id: r
        for r in session.exec(select(ExamResult).where(ExamResult.exam_id == exam.id)).all()
    }
    rows = []
    for st in students:
        r = results.get(st.id)
        rows.append(
            GradebookRow(
                student_id=st.id,
                student_name=st.full_name,
                result_id=r.id if r else None,
                status=r.status if r else None,
                score=r.score if r else None,
                teacher_note=r.teacher_note if r else None,
                internal_note=r.internal_note if r else None,
            )
        )
    return ExamDetailRead(**item.model_dump(), rows=rows)


@router.post("/exams", response_model=ExamRead, status_code=status.HTTP_201_CREATED)
def create_exam(payload: ExamCreate, session: SessionDep, current_user: CurrentUser) -> Exam:
    if current_user.role not in (UserRole.ADMIN, UserRole.TEACHER) and not is_admin(current_user):
        raise _forbidden("لا تملك صلاحية إنشاء الامتحانات")
    # الصلاحية قبل فحص الوجود: المعلم يحصل على 403 نفسه سواء وُجد الفصل أم لا.
    if not can_manage_exam(session, current_user, payload.classroom_id, payload.subject_id):
        raise _forbidden("هذه المادة/الفصل غير منسوبَين إليك")
    if session.get(ClassRoom, payload.classroom_id) is None:
        raise _not_found("الفصل غير موجود")
    if session.get(Subject, payload.subject_id) is None:
        raise _not_found("المادة غير موجودة")

    try:
        assert_weight_budget(
            session,
            classroom_id=payload.classroom_id,
            subject_id=payload.subject_id,
            term=payload.term,
            academic_year=payload.academic_year,
            weight_percent=payload.weight_percent,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    exam = Exam(**payload.model_dump(), status=ExamStatus.DRAFT, created_by=current_user.id)
    session.add(exam)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="يوجد امتحان بنفس العنوان لهذه المادة والفصل"
        )
    session.refresh(exam)
    log_action(
        session, current_user, "create", "exam", None, f"إنشاء امتحان «{exam.title}» ({exam.id})"
    )
    return exam


@router.patch("/exams/{exam_id}/status", response_model=ExamRead)
def change_exam_status(
    exam_id: uuid.UUID, payload: ExamStatusChange, session: SessionDep, current_user: CurrentUser
) -> Exam:
    if not is_admin(current_user):
        raise _forbidden("نشر الامتحان وإغلاقه من صلاحيات المدير فقط")
    exam = _get_exam_in_scope(session, current_user, exam_id)
    if payload.status not in _ALLOWED_TRANSITIONS[exam.status]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"لا يمكن تغيير الحالة من {exam.status.value} إلى {payload.status.value}",
        )
    exam.status = payload.status
    exam.updated_by = current_user.id
    session.add(exam)
    session.commit()
    session.refresh(exam)
    log_action(
        session, current_user, "update", "exam", None,
        f"تغيير حالة الامتحان {exam.id} إلى {exam.status.value}",
    )
    return exam


@router.post("/exams/{exam_id}/results/bulk", response_model=list[ResultRead])
def bulk_upsert_results(
    exam_id: uuid.UUID, payload: ResultBulkUpsert, session: SessionDep, current_user: CurrentUser
) -> list[ExamResult]:
    exam = _get_exam_in_scope(session, current_user, exam_id)
    if exam.status == ExamStatus.LOCKED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="الامتحان مغلق")
    if exam.status == ExamStatus.PUBLISHED and not is_admin(current_user):
        raise _forbidden("الامتحان منشور؛ تعديل الدرجات للمدير فقط")

    student_ids = [r.student_id for r in payload.results]
    in_class = set(
        session.exec(
            select(Student.id).where(
                Student.id.in_(student_ids), Student.classroom_id == exam.classroom_id
            )
        ).all()
    )

    # تحقق كامل قبل أي كتابة: إما أن تُحفظ كل الدرجات أو لا شيء.
    errors: list[str] = []
    for row in payload.results:
        if row.student_id not in in_class:
            errors.append(f"الطالب {row.student_id}: غير تابع لفصل الامتحان")
            continue
        try:
            assert_score_within_max(row.score, exam)
        except ValueError as exc:
            errors.append(f"الطالب {row.student_id}: {exc}")
    if errors:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=errors)

    existing = {
        r.student_id: r
        for r in session.exec(
            select(ExamResult).where(
                ExamResult.exam_id == exam.id, ExamResult.student_id.in_(student_ids)
            )
        ).all()
    }
    saved: list[ExamResult] = []
    for row in payload.results:
        result = existing.get(row.student_id)
        if result is None:
            result = ExamResult(
                exam_id=exam.id, student_id=row.student_id, created_by=current_user.id
            )
        else:
            result.updated_by = current_user.id
        result.status = row.status
        result.score = row.score
        result.teacher_note = row.teacher_note
        result.internal_note = row.internal_note
        session.add(result)
        saved.append(result)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="تعارض في حفظ الدرجات، أعد المحاولة"
        )
    for result in saved:
        session.refresh(result)
    log_action(
        session, current_user, "update", "exam_results", None,
        f"إدخال/تعديل {len(saved)} درجة للامتحان {exam.id}",
    )
    return saved


# ---------------------------------------------------------------------------
# كشوف الدرجات
# ---------------------------------------------------------------------------


def _staff_student(session: SessionDep, user, student_id: int) -> Student:
    if user.role == UserRole.PARENT:
        raise _forbidden("استخدم مسار ولي الأمر لعرض كشف الدرجات")
    visible = visible_student_ids(user, session)
    student = session.get(Student, student_id)
    if student is None or (visible is not None and student_id not in visible):
        raise _not_found("الطالب غير موجود")
    return student


@router.get("/students/{student_id}/report-card", response_model=ReportCardRead)
def get_report_card(
    student_id: int,
    term: Annotated[Term, Query()],
    academic_year: Annotated[AcademicYear, Query()],
    session: SessionDep,
    current_user: CurrentUser,
) -> ReportCardRead:
    """للطاقم: يعيد الكشف المنشور كما هو، وإلا يولّد/يحدّث مسودة من الدرجات الحالية."""
    student = _staff_student(session, current_user, student_id)
    card = upsert_report_card(session, student, term, academic_year, current_user)
    return _card_to_read(session, card, student, ReportCardRead)


@router.post("/students/{student_id}/report-card/publish", response_model=ReportCardRead)
def publish_report_card(
    student_id: int,
    term: Annotated[Term, Query()],
    academic_year: Annotated[AcademicYear, Query()],
    session: SessionDep,
    current_user: CurrentUser,
) -> ReportCardRead:
    """للمدير: يعيد الحساب ثم ينشر الكشف لولي الأمر (ويمكن تكراره لتحديث كشف منشور)."""
    if not is_admin(current_user):
        raise _forbidden("نشر كشف الدرجات من صلاحيات المدير فقط")
    student = _staff_student(session, current_user, student_id)
    card = upsert_report_card(session, student, term, academic_year, current_user, publish=True)
    log_action(
        session, current_user, "update", "report_card", None,
        f"نشر كشف درجات الطالب {student.full_name} ({card.id})",
    )
    return _card_to_read(session, card, student, ReportCardRead)


@router.get("/guardian/students/{student_id}/report-cards", response_model=GuardianReportCardList)
def list_guardian_report_cards(
    student_id: int, session: SessionDep, current_user: CurrentUser
) -> GuardianReportCardList:
    """كشوف ابن ولي الأمر المنشورة (بلا أرقام). عند الحجب المالي: قائمة فارغة + رسالة المراجعة."""
    if current_user.role != UserRole.PARENT:
        raise _forbidden("هذا المسار مخصص لأولياء الأمور")
    student = session.exec(
        select(Student).where(Student.id == student_id, Student.guardian_user_id == current_user.id)
    ).first()
    if student is None:
        raise _not_found("الطالب غير موجود")
    if has_financial_hold(session, student.id):
        return GuardianReportCardList(financial_hold=True, hold_message=HOLD_MESSAGE, cards=[])
    cards = session.exec(
        select(ReportCard)
        .where(ReportCard.student_id == student.id, ReportCard.status == ReportCardStatus.PUBLISHED)
        .order_by(ReportCard.academic_year.desc(), ReportCard.term)
    ).all()
    return GuardianReportCardList(
        cards=[
            GuardianReportCardSummary(term=c.term, academic_year=c.academic_year, published_at=c.published_at)
            for c in cards
        ]
    )


@router.get("/guardian/students/{student_id}/report-card", response_model=GuardianReportCardRead)
def get_guardian_report_card(
    student_id: int,
    term: Annotated[Term, Query()],
    academic_year: Annotated[AcademicYear, Query()],
    session: SessionDep,
    current_user: CurrentUser,
) -> GuardianReportCardRead:
    """لولي الأمر: كشوف أبنائه المنشورة فقط. أي طالب آخر أو كشف غير منشور ⇒ 404 موحَّد.

    الحجب المالي: إذا تجاوزت أقساط الطالب المتأخرة الحد المضبوط ⇒ 403 برمز financial_hold."""
    if current_user.role != UserRole.PARENT:
        raise _forbidden("هذا المسار مخصص لأولياء الأمور")
    student = session.exec(
        select(Student).where(
            Student.id == student_id, Student.guardian_user_id == current_user.id
        )
    ).first()
    if student is not None and has_financial_hold(session, student.id):
        # الحجب المالي: يأتي بعد التحقق من أن الطالب ابن المستخدم (لا نكشف حالة طلاب الآخرين)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "financial_hold", "message": HOLD_MESSAGE},
        )
    card = None
    if student is not None:
        card = session.exec(
            select(ReportCard).where(
                ReportCard.student_id == student.id,
                ReportCard.term == term,
                ReportCard.academic_year == academic_year,
                ReportCard.status == ReportCardStatus.PUBLISHED,
            )
        ).first()
    if student is None or card is None:
        raise _not_found("كشف الدرجات غير متاح")
    return _card_to_read(session, card, student, GuardianReportCardRead)

