"""نظام الامتحانات والدرجات وكشوف الطلاب (Grades & Examinations).

الملف مقسَّم إلى خمسة أقسام:
  1. الأنواع المساعدة (Enums) وأنواع الحقول المقيَّدة.
  2. نماذج قاعدة البيانات الداخلية (table=True) — لا تُعاد أبدًا مباشرةً من الـ API.
  3. مخططات الإدخال (Input DTOs)  — لا تحوي أي حقل تدقيق أو مفتاح داخلي.
  4. مخططات الإخراج (Output DTOs) — واحد لكل دور (طاقم / ولي أمر).
  5. دوال تحقق تحتاج قاعدة البيانات (لا يمكن التعبير عنها كقيد على حقل).

قرارات أمنية وهندسية:
  * المفاتيح الأساسية UUIDv4 (لا تُخمَّن ولا تُعدَّد)، أما المفاتيح الأجنبية نحو
    الجداول القائمة (student / subject / classroom / user) فتبقى int لأن تلك
    الجداول تستخدم int حاليًا.
  * pydantic لا يتحقق من نماذج table=True عند الإنشاء، لذا القيود موجودة في مكانين:
    CheckConstraint على مستوى قاعدة البيانات + Field/validators في الـ DTOs.
  * حقول التدقيق (created_by/created_at/updated_by/updated_at) لا تظهر في أي
    DTO إدخال، ويُرفَض أي حقل زائد (extra="forbid") منعًا لـ Mass Assignment.
  * الأوزان والدرجات Decimal وليست float لتفادي أخطاء التقريب.
"""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Annotated

from pydantic import ConfigDict, StringConstraints, field_validator, model_validator
from sqlalchemy import CheckConstraint, DateTime, UniqueConstraint, func
from sqlmodel import Field, Session, SQLModel, select

# ---------------------------------------------------------------------------
# 1) الأنواع المساعدة
# ---------------------------------------------------------------------------


class ExamType(str, Enum):
    QUIZ = "quiz"  # اختبار قصير
    ASSIGNMENT = "assignment"  # واجب / نشاط
    ORAL = "oral"  # شفهي
    PRACTICAL = "practical"  # عملي
    MIDTERM = "midterm"  # نصفي
    FINAL = "final"  # نهائي


class Term(str, Enum):
    FIRST = "first"
    SECOND = "second"


class ExamStatus(str, Enum):
    DRAFT = "draft"  # قابل للتعديل، لا يراه أولياء الأمور
    PUBLISHED = "published"  # الدرجات ظاهرة لأولياء الأمور
    LOCKED = "locked"  # مغلق نهائيًا: لا تعديل على الامتحان ولا على درجاته


class ResultStatus(str, Enum):
    GRADED = "graded"  # له درجة
    ABSENT = "absent"  # غائب (بلا درجة)
    EXCUSED = "excused"  # معفى / غياب بعذر (بلا درجة، ويُستبعد من الحساب)


class ReportCardStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class OverallResult(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    INCOMPLETE = "incomplete"  # توجد امتحانات بلا درجات بعد


# أنواع مقيَّدة قابلة لإعادة الاستخدام (تُطبَّق على الـ DTOs وعلى الأعمدة).
Percent = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]
Weight = Annotated[Decimal, Field(gt=0, le=100, max_digits=5, decimal_places=2)]
Score = Annotated[Decimal, Field(ge=0, le=1000, max_digits=6, decimal_places=2)]
MaxScore = Annotated[Decimal, Field(gt=0, le=1000, max_digits=6, decimal_places=2)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
AcademicYear = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{4}[-/]\d{4}$")]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# 2) نماذج قاعدة البيانات (داخلية فقط)
# ---------------------------------------------------------------------------


class AuditMixin(SQLModel):
    """حقول التدقيق المشتركة. تُملأ من الخادم فقط (المستخدم الحالي من JWT)."""

    created_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True), nullable=False)
    updated_at: datetime = Field(
        default_factory=_utcnow,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"onupdate": _utcnow},
        nullable=False,
    )
    created_by: int = Field(foreign_key="user.id", index=True, nullable=False)
    updated_by: int | None = Field(default=None, foreign_key="user.id")


class Exam(AuditMixin, table=True):
    """امتحان واحد لمادة واحدة في فصل واحد خلال فصل دراسي (Term) واحد."""

    __table_args__ = (
        CheckConstraint("max_score > 0 AND max_score <= 1000", name="ck_exam_max_score_range"),
        CheckConstraint("weight_percent > 0 AND weight_percent <= 100", name="ck_exam_weight_range"),
        UniqueConstraint("classroom_id", "subject_id", "term", "academic_year", "title", name="uq_exam_identity"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(max_length=120)
    exam_type: ExamType
    term: Term = Field(index=True)
    academic_year: str = Field(max_length=9, index=True)
    exam_date: date
    max_score: Decimal = Field(max_digits=6, decimal_places=2)
    weight_percent: Decimal = Field(max_digits=5, decimal_places=2)
    status: ExamStatus = Field(default=ExamStatus.DRAFT, index=True)

    subject_id: int = Field(foreign_key="subject.id", index=True, ondelete="RESTRICT")
    classroom_id: int = Field(foreign_key="classroom.id", index=True, ondelete="RESTRICT")


class ExamResult(AuditMixin, table=True):
    """درجة طالب واحد في امتحان واحد (صف واحد لكل طالب/امتحان)."""

    __table_args__ = (
        CheckConstraint("score IS NULL OR score >= 0", name="ck_result_score_non_negative"),
        UniqueConstraint("exam_id", "student_id", name="uq_result_exam_student"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    exam_id: uuid.UUID = Field(foreign_key="exam.id", index=True, ondelete="RESTRICT")
    student_id: int = Field(foreign_key="student.id", index=True, ondelete="RESTRICT")
    score: Decimal | None = Field(default=None, max_digits=6, decimal_places=2)
    status: ResultStatus = Field(default=ResultStatus.GRADED)
    teacher_note: str | None = Field(default=None, max_length=500)  # يراها ولي الأمر
    internal_note: str | None = Field(default=None, max_length=500)  # للطاقم فقط


class ReportCard(AuditMixin, table=True):
    """كشف درجات طالب لفصل دراسي: لقطة (Snapshot) تُحسب من الخادم ولا يُدخلها العميل."""

    __table_args__ = (
        CheckConstraint(
            "overall_percentage IS NULL OR (overall_percentage >= 0 AND overall_percentage <= 100)",
            name="ck_reportcard_percentage_range",
        ),
        UniqueConstraint("student_id", "term", "academic_year", name="uq_reportcard_student_term"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: int = Field(foreign_key="student.id", index=True, ondelete="RESTRICT")
    term: Term
    academic_year: str = Field(max_length=9)
    overall_percentage: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    overall_result: OverallResult = Field(default=OverallResult.INCOMPLETE)
    status: ReportCardStatus = Field(default=ReportCardStatus.DRAFT, index=True)
    published_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))


class ReportCardEntry(AuditMixin, table=True):
    """سطر مادة واحدة داخل كشف الدرجات."""

    __table_args__ = (
        CheckConstraint("weighted_percentage >= 0 AND weighted_percentage <= 100", name="ck_entry_percentage_range"),
        UniqueConstraint("report_card_id", "subject_id", name="uq_entry_card_subject"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    report_card_id: uuid.UUID = Field(foreign_key="reportcard.id", index=True, ondelete="CASCADE")
    subject_id: int = Field(foreign_key="subject.id", index=True, ondelete="RESTRICT")
    weighted_percentage: Decimal = Field(max_digits=5, decimal_places=2)


# ---------------------------------------------------------------------------
# 3) مخططات الإدخال (Input DTOs)
# ---------------------------------------------------------------------------


class _StrictInput(SQLModel):
    """أساس كل مدخلات العميل: يرفض الحقول الزائدة (id / created_by / status المحجوز ...)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ExamCreate(_StrictInput):
    title: Title
    exam_type: ExamType
    term: Term
    academic_year: AcademicYear
    exam_date: date
    max_score: MaxScore
    weight_percent: Weight
    subject_id: int = Field(gt=0)
    classroom_id: int = Field(gt=0)


class ExamUpdate(_StrictInput):
    """تعديل جزئي. الفصل والمادة والفصل الدراسي والسنة غير قابلة للتعديل بعد الإنشاء،
    وتغيير الحالة (نشر/إغلاق) يتم عبر مسار مستقل بصلاحية أعلى."""

    title: Title | None = None
    exam_type: ExamType | None = None
    exam_date: date | None = None
    max_score: MaxScore | None = None
    weight_percent: Weight | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> "ExamUpdate":
        if not self.model_fields_set:
            raise ValueError("لا توجد حقول للتعديل")
        return self


class ResultUpsert(_StrictInput):
    """درجة طالب واحد. الدرجة مطلوبة إذا كانت الحالة graded، وممنوعة في غير ذلك.
    مقارنتها بالحد الأقصى للامتحان تتم في assert_score_within_max (تحتاج الامتحان)."""

    student_id: int = Field(gt=0)
    status: ResultStatus = ResultStatus.GRADED
    score: Score | None = None
    teacher_note: Note | None = None
    internal_note: Note | None = None

    @model_validator(mode="after")
    def _score_matches_status(self) -> "ResultUpsert":
        if self.status == ResultStatus.GRADED and self.score is None:
            raise ValueError("الدرجة مطلوبة عندما تكون الحالة 'مُصحَّح'")
        if self.status != ResultStatus.GRADED and self.score is not None:
            raise ValueError("لا يجوز إدخال درجة لطالب غائب أو معفى")
        return self


class ResultBulkUpsert(_StrictInput):
    """إدخال درجات فصل كامل دفعة واحدة (حدّ أقصى 200 طالب لكل طلب)."""

    results: list[ResultUpsert] = Field(min_length=1, max_length=200)

    @field_validator("results")
    @classmethod
    def _unique_students(cls, v: list[ResultUpsert]) -> list[ResultUpsert]:
        ids = [r.student_id for r in v]
        if len(ids) != len(set(ids)):
            raise ValueError("يوجد طالب مكرَّر في الطلب")
        return v


class ReportCardGenerate(_StrictInput):
    """طلب توليد كشوف لفصل دراسي؛ الأرقام تُحسب من الخادم ولا تُرسَل من العميل."""

    classroom_id: int = Field(gt=0)
    term: Term
    academic_year: AcademicYear


# ---------------------------------------------------------------------------
# 4) مخططات الإخراج (Output DTOs) — فصل صارم حسب الدور
# ---------------------------------------------------------------------------


class _Output(SQLModel):
    model_config = ConfigDict(from_attributes=True)


# --- للطاقم (مدير / معلم / محاسب): يشمل بيانات التدقيق ---


class ExamRead(_Output):
    id: uuid.UUID
    title: str
    exam_type: ExamType
    term: Term
    academic_year: str
    exam_date: date
    max_score: Decimal
    weight_percent: Decimal
    status: ExamStatus
    subject_id: int
    classroom_id: int
    created_at: datetime
    updated_at: datetime
    created_by: int
    updated_by: int | None


class ResultRead(_Output):
    id: uuid.UUID
    exam_id: uuid.UUID
    student_id: int
    score: Decimal | None
    status: ResultStatus
    teacher_note: str | None
    internal_note: str | None
    created_at: datetime
    updated_at: datetime
    created_by: int
    updated_by: int | None


class ReportCardEntryRead(_Output):
    subject_id: int
    weighted_percentage: Decimal


class ReportCardRead(_Output):
    id: uuid.UUID
    student_id: int
    term: Term
    academic_year: str
    overall_percentage: Decimal | None
    overall_result: OverallResult
    status: ReportCardStatus
    published_at: datetime | None
    entries: list[ReportCardEntryRead] = []
    created_at: datetime
    updated_at: datetime
    created_by: int
    updated_by: int | None


# --- لولي الأمر: بلا created_by ولا internal_note ولا بيانات تدقيق ولا امتحانات غير منشورة ---


class ExamGuardianRead(_Output):
    id: uuid.UUID
    title: str
    exam_type: ExamType
    term: Term
    academic_year: str
    exam_date: date
    max_score: Decimal
    weight_percent: Decimal
    subject_id: int


class ResultGuardianRead(_Output):
    exam_id: uuid.UUID
    score: Decimal | None
    status: ResultStatus
    teacher_note: str | None


class ReportCardGuardianRead(_Output):
    id: uuid.UUID
    term: Term
    academic_year: str
    overall_percentage: Decimal | None
    overall_result: OverallResult
    published_at: datetime | None
    entries: list[ReportCardEntryRead] = []


# ---------------------------------------------------------------------------
# 5) تحققات تحتاج قاعدة البيانات / الامتحان (تُستدعى من الـ routers داخل المعاملة)
# ---------------------------------------------------------------------------

_HUNDRED = Decimal("100")


def assert_score_within_max(score: Decimal | None, exam: Exam) -> None:
    """الدرجة لا تتجاوز الحد الأقصى للامتحان، والامتحان المغلق لا يقبل تعديلًا."""
    if exam.status == ExamStatus.LOCKED:
        raise ValueError("الامتحان مغلق ولا يمكن تعديل درجاته")
    if score is not None and score > exam.max_score:
        raise ValueError(f"الدرجة ({score}) تتجاوز الحد الأقصى للامتحان ({exam.max_score})")


def assert_weight_budget(
    session: Session,
    *,
    classroom_id: int,
    subject_id: int,
    term: Term,
    academic_year: str,
    weight_percent: Decimal,
    exclude_exam_id: uuid.UUID | None = None,
) -> None:
    """مجموع أوزان امتحانات (فصل + مادة + فصل دراسي + سنة) لا يتجاوز 100%.

    عند التعديل مرِّر exclude_exam_id لاستبعاد الامتحان نفسه. للحماية من سباق
    الطلبات المتزامنة نفِّذ الاستدعاء داخل نفس المعاملة التي تُدرج الامتحان،
    وفي PostgreSQL استخدم with_for_update() على سطر الفصل أو مستوى عزل SERIALIZABLE.
    """
    stmt = select(func.coalesce(func.sum(Exam.weight_percent), 0)).where(
        Exam.classroom_id == classroom_id,
        Exam.subject_id == subject_id,
        Exam.term == term,
        Exam.academic_year == academic_year,
    )
    if exclude_exam_id is not None:
        stmt = stmt.where(Exam.id != exclude_exam_id)
    existing = Decimal(str(session.exec(stmt).one()))
    if existing + weight_percent > _HUNDRED:
        raise ValueError(
            f"مجموع أوزان الامتحانات سيصبح {existing + weight_percent}% وهو يتجاوز 100% "
            f"(المستخدم حاليًا {existing}%)"
        )


def assert_max_score_not_below_results(session: Session, exam_id: uuid.UUID, new_max_score: Decimal) -> None:
    """عند خفض الحد الأقصى لامتحان: لا يجوز أن تبقى درجات مسجَّلة أكبر منه."""
    highest = session.exec(select(func.max(ExamResult.score)).where(ExamResult.exam_id == exam_id)).one()
    if highest is not None and Decimal(str(highest)) > new_max_score:
        raise ValueError(f"توجد درجة مسجَّلة ({highest}) أكبر من الحد الأقصى الجديد ({new_max_score})")
