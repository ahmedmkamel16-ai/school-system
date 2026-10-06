"""النظام المالي: الرسوم المقررة، حسابات الطلاب، الأقساط، وسندات القبض.

مبادئ التصميم:
  * المبالغ Decimal (لا float). المفاتيح UUIDv4 كما في نظام الدرجات.
  * سندات القبض (PaymentReceipt) غير قابلة للتعديل أو الحذف أبدًا: التصحيح يتم فقط
    بسند عكس (REVERSAL) جديد يشير إلى الأصلي. تُفرض القاعدة في ثلاث طبقات:
    ORM (أحداث before_update/before_delete هنا) + Triggers في الـ migration + عدم وجود
    أي مسار تعديل/حذف في الـ API.
  * الرصيد المخزَّن (paid_amount) يُحدَّث فقط داخل نفس المعاملة التي تُنشئ السند
    (انظر app/core/finance.py)، ومحمي بقيود CHECK بحيث لا يتجاوز الصافي ولا ينزل عن صفر.
  * حالة القسط (مدفوع/متأخر/قادم) تُشتق وقت القراءة من (المدفوع، تاريخ الاستحقاق، اليوم)
    ولا تُخزَّن، فلا تتقادم.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Annotated

from pydantic import ConfigDict, StringConstraints, field_validator, model_validator
from sqlalchemy import CheckConstraint, UniqueConstraint, event
from sqlmodel import Field, SQLModel

from app.models.grades import AcademicYear, Term
from app.models.mixins import AuditMixin

# ---------------------------------------------------------------------------
# 1) الأنواع المساعدة
# ---------------------------------------------------------------------------


class PaymentMethod(str, Enum):
    CASH = "cash"  # نقدي
    TRANSFER = "transfer"  # حوالة
    ZAIN_CASH = "zain_cash"  # زين كاش


class ReceiptKind(str, Enum):
    PAYMENT = "payment"
    REVERSAL = "reversal"  # سند عكس/إلغاء يشير إلى سند دفع سابق


class InstallmentStatus(str, Enum):
    PAID = "paid"  # مدفوع
    OVERDUE = "overdue"  # متأخر
    UPCOMING = "upcoming"  # قادم


Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]
PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
Percent = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Reference = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
IdempotencyKey = Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=64)]

# ---------------------------------------------------------------------------
# 2) نماذج قاعدة البيانات (داخلية فقط)
# ---------------------------------------------------------------------------


class FeeStructure(AuditMixin, table=True):
    """الرسوم المقررة لصف دراسي في عام (وفصل دراسي اختياريًا)."""

    __tablename__ = "fee_structures"
    __table_args__ = (
        CheckConstraint("total_amount > 0", name="ck_fee_structure_total_positive"),
        CheckConstraint("max_discount_percent >= 0 AND max_discount_percent <= 100", name="ck_fee_structure_discount_range"),
        UniqueConstraint("grade_level", "academic_year", "name", name="uq_fee_structure_identity"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=120)
    grade_level: str = Field(max_length=60, index=True)
    academic_year: str = Field(max_length=9, index=True)
    term: Term | None = Field(default=None)  # None = رسوم العام كاملًا
    total_amount: Decimal = Field(max_digits=14, decimal_places=2)
    max_discount_percent: Decimal = Field(default=Decimal("0"), max_digits=5, decimal_places=2)
    is_active: bool = Field(default=True)


class StudentFee(AuditMixin, table=True):
    """حساب الطالب لرسم واحد: المستحق، الخصم، الصافي، والمدفوع (المتبقي = الصافي − المدفوع)."""

    __tablename__ = "student_fees"
    __table_args__ = (
        CheckConstraint("amount_due >= 0", name="ck_student_fee_due_non_negative"),
        CheckConstraint("discount_amount >= 0 AND discount_amount <= amount_due", name="ck_student_fee_discount_range"),
        CheckConstraint("net_amount = amount_due - discount_amount", name="ck_student_fee_net_consistent"),
        CheckConstraint("paid_amount >= 0 AND paid_amount <= net_amount", name="ck_student_fee_paid_range"),
        UniqueConstraint("student_id", "fee_structure_id", name="uq_student_fee_assignment"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    student_id: int = Field(foreign_key="student.id", index=True, ondelete="RESTRICT")
    fee_structure_id: uuid.UUID = Field(foreign_key="fee_structures.id", index=True, ondelete="RESTRICT")
    amount_due: Decimal = Field(max_digits=14, decimal_places=2)
    discount_percent: Decimal = Field(default=Decimal("0"), max_digits=5, decimal_places=2)
    discount_amount: Decimal = Field(default=Decimal("0"), max_digits=14, decimal_places=2)
    discount_reason: str | None = Field(default=None, max_length=500)
    net_amount: Decimal = Field(max_digits=14, decimal_places=2)
    paid_amount: Decimal = Field(default=Decimal("0"), max_digits=14, decimal_places=2)


class PaymentPlan(AuditMixin, table=True):
    """قسط واحد من جدول أقساط حساب طالب (مجموع أقساط الحساب = صافيه)."""

    __tablename__ = "payment_plans"
    __table_args__ = (
        CheckConstraint("installment_no > 0", name="ck_plan_number_positive"),
        CheckConstraint("amount > 0", name="ck_plan_amount_positive"),
        CheckConstraint("paid_amount >= 0 AND paid_amount <= amount", name="ck_plan_paid_range"),
        UniqueConstraint("student_fee_id", "installment_no", name="uq_plan_installment_no"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    student_fee_id: uuid.UUID = Field(foreign_key="student_fees.id", index=True, ondelete="RESTRICT")
    installment_no: int
    due_date: date = Field(index=True)
    amount: Decimal = Field(max_digits=14, decimal_places=2)
    paid_amount: Decimal = Field(default=Decimal("0"), max_digits=14, decimal_places=2)


class PaymentReceipt(AuditMixin, table=True):
    """سند قبض (PAYMENT) أو سند عكس (REVERSAL). المحصِّل = created_by. لا تعديل ولا حذف أبدًا."""

    __tablename__ = "payment_receipts"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_receipt_amount_positive"),
        CheckConstraint("reversal_of_id IS NULL OR reversal_reason IS NOT NULL", name="ck_receipt_reversal_has_reason"),
        UniqueConstraint("receipt_number", name="uq_receipt_number"),
        UniqueConstraint("reversal_of_id", name="uq_receipt_single_reversal"),
        UniqueConstraint("idempotency_key", name="uq_receipt_idempotency_key"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    receipt_number: str = Field(max_length=32, index=True)
    kind: ReceiptKind = Field(default=ReceiptKind.PAYMENT)
    student_fee_id: uuid.UUID = Field(foreign_key="student_fees.id", index=True, ondelete="RESTRICT")
    student_id: int = Field(foreign_key="student.id", index=True, ondelete="RESTRICT")
    amount: Decimal = Field(max_digits=14, decimal_places=2)
    method: PaymentMethod
    reference: str | None = Field(default=None, max_length=100)  # رقم الحوالة / معاملة زين كاش
    paid_at: date = Field(index=True)
    note: str | None = Field(default=None, max_length=500)
    reversal_of_id: uuid.UUID | None = Field(default=None, foreign_key="payment_receipts.id", ondelete="RESTRICT")
    reversal_reason: str | None = Field(default=None, max_length=500)
    idempotency_key: str | None = Field(default=None, max_length=64)


class ReceiptAllocation(AuditMixin, table=True):
    """توزيع سند دفع على الأقساط؛ يُستخدم عند العكس لإرجاع كل قسط إلى حاله."""

    __tablename__ = "receipt_allocations"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_allocation_amount_positive"),
        UniqueConstraint("receipt_id", "installment_id", name="uq_allocation_receipt_installment"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    receipt_id: uuid.UUID = Field(foreign_key="payment_receipts.id", index=True, ondelete="RESTRICT")
    installment_id: uuid.UUID = Field(foreign_key="payment_plans.id", index=True, ondelete="RESTRICT")
    amount: Decimal = Field(max_digits=14, decimal_places=2)


class ReceiptCounter(SQLModel, table=True):
    """عدّاد أرقام السندات لكل سنة؛ يُزاد بـ UPDATE داخل معاملة الدفع فيتسلسل التوليد بلا تكرار."""

    __tablename__ = "receipt_counters"

    year: int = Field(primary_key=True)
    last_value: int = Field(default=0)


class ImmutableRecordError(RuntimeError):
    """محاولة تعديل/حذف سجل مالي ثابت."""


def _forbid_change(_mapper, _connection, target) -> None:
    raise ImmutableRecordError(
        f"{type(target).__name__} سجل مالي ثابت: لا تعديل ولا حذف. استخدم سند عكس."
    )


for _model in (PaymentReceipt, ReceiptAllocation):
    event.listen(_model, "before_update", _forbid_change)
    event.listen(_model, "before_delete", _forbid_change)

# ---------------------------------------------------------------------------
# 3) مخططات الإدخال (Input DTOs)
# ---------------------------------------------------------------------------


class _StrictInput(SQLModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class FeeStructureCreate(_StrictInput):
    name: Name
    grade_level: Name
    academic_year: AcademicYear
    term: Term | None = None
    total_amount: PositiveMoney
    max_discount_percent: Percent = Decimal("0")


class InstallmentSpec(_StrictInput):
    due_date: date
    amount: PositiveMoney


class ScheduleSpec(_StrictInput):
    """جدول أقساط متساوية يُولَّد من الخادم؛ الباقي (فرق التقريب) يُضاف على القسط الأخير."""

    count: int = Field(ge=1, le=24)
    first_due_date: date
    interval_months: int = Field(default=1, ge=1, le=12)


class PlanCreate(_StrictInput):
    """إنشاء حساب رسوم + جدول أقساط لطالب واحد أو لفصل كامل (نفس الشروط لجميع الطلاب)."""

    fee_structure_id: uuid.UUID
    student_id: int | None = Field(default=None, gt=0)
    classroom_id: int | None = Field(default=None, gt=0)
    discount_percent: Percent = Decimal("0")
    discount_reason: ShortText | None = None
    schedule: ScheduleSpec | None = None
    installments: list[InstallmentSpec] | None = Field(default=None, min_length=1, max_length=24)

    @model_validator(mode="after")
    def _validate(self) -> "PlanCreate":
        if (self.student_id is None) == (self.classroom_id is None):
            raise ValueError("حدّد طالبًا واحدًا أو فصلًا واحدًا (وليس كليهما)")
        if (self.schedule is None) == (self.installments is None):
            raise ValueError("حدّد إما schedule (توليد تلقائي) أو installments (يدوي)")
        if self.discount_percent > 0 and not self.discount_reason:
            raise ValueError("سبب الخصم مطلوب عند تطبيق خصم")
        if self.installments:
            numbers = [i.due_date for i in self.installments]
            if len(numbers) != len(set(numbers)):
                raise ValueError("تاريخ استحقاق مكرر بين الأقساط")
        return self


class ReceiptCreate(_StrictInput):
    student_fee_id: uuid.UUID
    amount: PositiveMoney
    method: PaymentMethod
    reference: Reference | None = None
    paid_at: date | None = None  # الافتراضي اليوم؛ التواريخ المستقبلية مرفوضة
    installment_id: uuid.UUID | None = None  # اختياري: دفع قسط محدد، وإلا يوزَّع على الأقدم فالأحدث
    note: ShortText | None = None
    idempotency_key: IdempotencyKey | None = None

    @field_validator("reference")
    @classmethod
    def _transfer_reference(cls, v: str | None) -> str | None:
        return v or None


class ReceiptReverse(_StrictInput):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=500)]


# ---------------------------------------------------------------------------
# 4) مخططات الإخراج (Output DTOs) — طاقم / ولي أمر
# ---------------------------------------------------------------------------


class _Output(SQLModel):
    model_config = ConfigDict(from_attributes=True)


class FeeStructureRead(_Output):
    id: uuid.UUID
    name: str
    grade_level: str
    academic_year: str
    term: Term | None
    total_amount: Decimal
    max_discount_percent: Decimal
    is_active: bool


class InstallmentRead(_Output):
    id: uuid.UUID
    installment_no: int
    due_date: date
    amount: Decimal
    paid_amount: Decimal
    remaining: Decimal
    status: InstallmentStatus
    days_overdue: int = 0


class StudentFeeRead(_Output):
    id: uuid.UUID
    fee_structure_id: uuid.UUID
    fee_name: str
    academic_year: str
    term: Term | None
    amount_due: Decimal
    discount_percent: Decimal
    discount_amount: Decimal
    discount_reason: str | None
    net_amount: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    installments: list[InstallmentRead] = []


class AllocationRead(_Output):
    installment_id: uuid.UUID
    installment_no: int | None = None
    amount: Decimal


class ReceiptRead(_Output):
    """للطاقم: يشمل المحصِّل والمرجع والملاحظات ورمز التحقق."""

    id: uuid.UUID
    receipt_number: str
    kind: ReceiptKind
    student_fee_id: uuid.UUID
    student_id: int
    student_name: str | None = None
    fee_name: str | None = None
    amount: Decimal
    method: PaymentMethod
    reference: str | None
    paid_at: date
    note: str | None
    reversal_of_id: uuid.UUID | None
    reversal_reason: str | None
    is_reversed: bool = False
    collected_by: int
    collected_by_name: str | None = None
    created_at: datetime
    verification_code: str
    allocations: list[AllocationRead] = []


class GuardianReceiptRead(_Output):
    """لولي الأمر: بلا المحصِّل ولا المرجع ولا الملاحظات الداخلية."""

    receipt_number: str
    kind: ReceiptKind
    amount: Decimal
    method: PaymentMethod
    paid_at: date
    is_reversed: bool = False
    fee_name: str | None = None


class StatementTotals(_Output):
    net_total: Decimal
    paid_total: Decimal
    remaining_total: Decimal
    overdue_amount: Decimal
    overdue_count: int


class StatementRead(_Output):
    student_id: int
    student_name: str
    classroom_name: str | None
    fees: list[StudentFeeRead]
    receipts: list[ReceiptRead]
    totals: StatementTotals
    financial_hold: bool


class GuardianStatementRead(_Output):
    student_name: str
    classroom_name: str | None
    fees: list[StudentFeeRead]
    receipts: list[GuardianReceiptRead]
    totals: StatementTotals
    financial_hold: bool
    hold_message: str | None = None


class PlanCreateResult(_Output):
    created_student_ids: list[int]
    skipped_student_ids: list[int]  # لديهم هذا الرسم مسبقًا
    fee_ids: list[uuid.UUID]


class DefaulterRead(_Output):
    student_id: int
    student_name: str
    classroom_name: str | None
    guardian_name: str
    guardian_phone: str
    overdue_amount: Decimal
    overdue_installments: int
    oldest_due_date: date
    days_overdue: int
    remaining_total: Decimal
    financial_hold: bool


class MethodTotal(_Output):
    method: PaymentMethod
    total: Decimal
    count: int


class FinancialSummaryRead(_Output):
    as_of: date
    today_collected: Decimal
    today_receipts: int
    month_collected: Decimal
    net_total: Decimal
    paid_total: Decimal
    remaining_total: Decimal
    collection_rate: Decimal
    overdue_amount: Decimal
    overdue_students: int
    held_students: int
    by_method_today: list[MethodTotal]


class ReceiptVerifyRead(_Output):
    valid: bool
    receipt_number: str | None = None
    kind: ReceiptKind | None = None
    amount: Decimal | None = None
    paid_at: date | None = None
    reversed: bool | None = None

