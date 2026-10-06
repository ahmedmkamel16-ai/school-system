"""منطق الصلاحيات (Object-Level) وحساب كشوف الدرجات — بلا أي اعتماد على HTTP."""

from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlmodel import Session, select

from app.models.classroom import ClassRoom
from app.models.grades import (
    Exam,
    ExamResult,
    ExamStatus,
    OverallResult,
    ReportCard,
    ReportCardEntry,
    ReportCardStatus,
    ResultStatus,
    Term,
)
from app.models.student import Student
from app.models.teacher import TeacherSubject
from app.models.timetable import TimetableSlot
from app.models.user import User, UserRole

PASS_PERCENTAGE = Decimal("50")
_CENT = Decimal("0.01")


def is_admin(user: User) -> bool:
    """المدير، أو من فُوِّض بإدارة المستخدمين (نفس منطق بقية النظام)."""
    return user.role == UserRole.ADMIN or user.can_manage_users


def teacher_can_grade(session: Session, user: User, classroom_id: int, subject_id: int) -> bool:
    """المعلم يتعامل فقط مع (فصل، مادة) منسوبَين له:
    - لديه حصة في الجدول الدراسي لهذه المادة في هذا الفصل، أو
    - هو مربّي الفصل ومادة الامتحان ضمن المواد المسندة إليه.
    """
    if user.role != UserRole.TEACHER or user.teacher_id is None:
        return False
    has_slot = session.exec(
        select(TimetableSlot.id)
        .where(
            TimetableSlot.teacher_id == user.teacher_id,
            TimetableSlot.classroom_id == classroom_id,
            TimetableSlot.subject_id == subject_id,
        )
        .limit(1)
    ).first()
    if has_slot is not None:
        return True
    classroom = session.get(ClassRoom, classroom_id)
    if classroom is None or classroom.homeroom_teacher_id != user.teacher_id:
        return False
    return (
        session.exec(
            select(TeacherSubject.id).where(
                TeacherSubject.teacher_id == user.teacher_id,
                TeacherSubject.subject_id == subject_id,
            )
        ).first()
        is not None
    )


def teacher_scope_pairs(session: Session, user: User) -> set[tuple[int, int]]:
    """كل أزواج (فصل، مادة) المنسوبة للمعلم — نفس قاعدة teacher_can_grade لكن دفعة واحدة."""
    if user.role != UserRole.TEACHER or user.teacher_id is None:
        return set()
    pairs = {
        (c, s)
        for c, s in session.exec(
            select(TimetableSlot.classroom_id, TimetableSlot.subject_id).where(
                TimetableSlot.teacher_id == user.teacher_id
            )
        ).all()
    }
    homeroom = session.exec(
        select(ClassRoom.id).where(ClassRoom.homeroom_teacher_id == user.teacher_id)
    ).all()
    subjects = session.exec(
        select(TeacherSubject.subject_id).where(TeacherSubject.teacher_id == user.teacher_id)
    ).all()
    pairs.update((c, s) for c in homeroom for s in subjects)
    return pairs


def can_manage_exam(session: Session, user: User, classroom_id: int, subject_id: int) -> bool:
    return is_admin(user) or teacher_can_grade(session, user, classroom_id, subject_id)


def _q(value: Decimal) -> Decimal:
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


def compute_report_card(
    session: Session, student: Student, term: Term, academic_year: str
) -> tuple[Decimal | None, OverallResult, dict[int, Decimal]]:
    """يحسب كشف الطالب من الامتحانات المنشورة/المغلقة فقط (المسودات لا تدخل).

    لكل امتحان: درجة مُصحَّحة = وزن × (الدرجة ÷ الحد الأقصى)، الغائب = صفر،
    المعفى يُستبعد من البسط والمقام. نسبة المادة = المحصَّل ÷ مجموع الأوزان المحتسبة.
    المعدل العام = متوسط نسب المواد. النتيجة 'غير مكتملة' إن وُجد امتحان بلا سجل
    للطالب أو لم توجد امتحانات.
    """
    if student.classroom_id is None:
        return None, OverallResult.INCOMPLETE, {}

    exams = session.exec(
        select(Exam).where(
            Exam.classroom_id == student.classroom_id,
            Exam.term == term,
            Exam.academic_year == academic_year,
            Exam.status.in_([ExamStatus.PUBLISHED, ExamStatus.LOCKED]),
        )
    ).all()
    if not exams:
        return None, OverallResult.INCOMPLETE, {}

    results = {
        r.exam_id: r
        for r in session.exec(
            select(ExamResult).where(
                ExamResult.student_id == student.id,
                ExamResult.exam_id.in_([e.id for e in exams]),
            )
        ).all()
    }

    earned: dict[int, Decimal] = {}
    counted: dict[int, Decimal] = {}
    missing = False
    for exam in exams:
        result = results.get(exam.id)
        if result is None:
            missing = True
            continue
        if result.status == ResultStatus.EXCUSED:
            continue
        points = Decimal(0)
        if result.status == ResultStatus.GRADED and result.score is not None:
            points = exam.weight_percent * Decimal(result.score) / Decimal(exam.max_score)
        earned[exam.subject_id] = earned.get(exam.subject_id, Decimal(0)) + points
        counted[exam.subject_id] = counted.get(exam.subject_id, Decimal(0)) + exam.weight_percent

    subject_percentages = {
        sid: _q(earned[sid] / counted[sid] * 100) for sid in counted if counted[sid] > 0
    }
    if not subject_percentages:
        return None, OverallResult.INCOMPLETE, {}

    overall = _q(sum(subject_percentages.values()) / len(subject_percentages))
    if missing:
        outcome = OverallResult.INCOMPLETE
    else:
        outcome = OverallResult.PASSED if overall >= PASS_PERCENTAGE else OverallResult.FAILED
    return overall, outcome, subject_percentages


def upsert_report_card(
    session: Session,
    student: Student,
    term: Term,
    academic_year: str,
    user: User,
    *,
    publish: bool = False,
) -> ReportCard:
    """ينشئ/يحدّث لقطة الكشف. الكشف المنشور ثابت: لا يُعاد حسابه إلا عند النشر مجددًا."""
    card = session.exec(
        select(ReportCard).where(
            ReportCard.student_id == student.id,
            ReportCard.term == term,
            ReportCard.academic_year == academic_year,
        )
    ).first()
    if card is not None and card.status == ReportCardStatus.PUBLISHED and not publish:
        return card

    overall, outcome, per_subject = compute_report_card(session, student, term, academic_year)

    if card is None:
        card = ReportCard(
            student_id=student.id, term=term, academic_year=academic_year, created_by=user.id
        )
    else:
        card.updated_by = user.id
        for old in session.exec(
            select(ReportCardEntry).where(ReportCardEntry.report_card_id == card.id)
        ).all():
            session.delete(old)
        session.flush()  # يُنفَّذ الحذف قبل الإدراج حتى لا يصطدم بقيد التفرّد
    card.overall_percentage = overall
    card.overall_result = outcome
    if publish:
        card.status = ReportCardStatus.PUBLISHED
        card.published_at = datetime.now(timezone.utc)
    session.add(card)
    session.flush()
    for subject_id, pct in per_subject.items():
        session.add(
            ReportCardEntry(
                report_card_id=card.id,
                subject_id=subject_id,
                weighted_percentage=pct,
                created_by=user.id,
            )
        )
    session.commit()
    session.refresh(card)
    return card
