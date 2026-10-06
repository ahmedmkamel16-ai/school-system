"""منطق النظام المالي: الأقساط، تسجيل الدفع وعكسه بمعاملة ذرية، والحجب المالي.

كل دالة تكتب في قاعدة البيانات تُنهي عملها بـ commit واحد، وعند أي استثناء تعمل rollback
كاملًا؛ فلا يُسجَّل سند دون تحديث القسط ورصيد الطالب (ولا العكس).
"""

import calendar
import hashlib
import hmac
import uuid
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import settings
from app.models.financials import (
    FeeStructure,
    InstallmentSpec,
    InstallmentStatus,
    PaymentMethod,
    PaymentPlan,
    PaymentReceipt,
    ReceiptAllocation,
    ReceiptCounter,
    ReceiptKind,
    ScheduleSpec,
    StudentFee,
)
from app.models.student import Student
from app.models.user import User

_CENT = Decimal("0.01")
HOLD_MESSAGE = "يرجى مراجعة الحسابات"


class FinanceError(Exception):
    """خطأ منطقي مالي؛ يُحوَّل في الـ router إلى 4xx بالرسالة العربية."""

    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def q(value: Decimal | int | str) -> Decimal:
    return Decimal(value).quantize(_CENT, rounding=ROUND_HALF_UP)


# ------------------------------------------------------------------ أدوات الجدولة


def add_months(d: date, months: int) -> date:
    index = d.month - 1 + months
    year, month = d.year + index // 12, index % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def split_amount(total: Decimal, count: int) -> list[Decimal]:
    """يقسم المبلغ بالتساوي؛ فرق التقريب يذهب إلى القسط الأخير فيبقى المجموع مطابقًا تمامًا."""
    base = (total / count).quantize(_CENT, rounding=ROUND_HALF_UP)
    parts = [base] * count
    parts[-1] = q(total - base * (count - 1))
    return parts


def build_installments(net: Decimal, schedule: ScheduleSpec | None, explicit: list[InstallmentSpec] | None) -> list[tuple[date, Decimal]]:
    if net <= 0:
        if explicit:
            raise FinanceError("لا حاجة لأقساط: الصافي بعد الخصم صفر")
        return []
    if schedule is not None:
        amounts = split_amount(net, schedule.count)
        if any(a <= 0 for a in amounts):
            raise FinanceError("عدد الأقساط كبير جدًا بالنسبة للمبلغ")
        return [(add_months(schedule.first_due_date, i * schedule.interval_months), a) for i, a in enumerate(amounts)]
    assert explicit is not None
    total = q(sum((i.amount for i in explicit), Decimal(0)))
    if total != net:
        raise FinanceError(f"مجموع الأقساط ({total}) يجب أن يساوي الصافي ({net})")
    return sorted(((i.due_date, q(i.amount)) for i in explicit), key=lambda x: x[0])


# ------------------------------------------------------------------ الحالات والحجب


def installment_remaining(inst: PaymentPlan) -> Decimal:
    return q(Decimal(inst.amount) - Decimal(inst.paid_amount))


def installment_status(inst: PaymentPlan, today: date) -> InstallmentStatus:
    if installment_remaining(inst) <= 0:
        return InstallmentStatus.PAID
    return InstallmentStatus.OVERDUE if inst.due_date < today else InstallmentStatus.UPCOMING


def overdue_installments(session: Session, student_id: int | None, today: date, grace_days: int = 0):
    """أقساط غير مسددة تجاوز استحقاقها (اليوم − فترة السماح)، مع حساباتها."""
    cutoff = today - timedelta(days=grace_days)
    query = (
        select(PaymentPlan, StudentFee)
        .join(StudentFee, StudentFee.id == PaymentPlan.student_fee_id)
        .where(PaymentPlan.due_date < cutoff)
    )
    if student_id is not None:
        query = query.where(StudentFee.student_id == student_id)
    return [(p, f) for p, f in session.exec(query).all() if installment_remaining(p) > 0]


def overdue_total(session: Session, student_id: int, today: date | None = None, grace_days: int = 0) -> tuple[Decimal, int]:
    today = today or date.today()
    rows = overdue_installments(session, student_id, today, grace_days)
    return q(sum((installment_remaining(p) for p, _ in rows), Decimal(0))), len(rows)


def has_financial_hold(session: Session, student_id: int, today: date | None = None) -> bool:
    """حجب الشهادة: المتأخر (بعد السماح) يتجاوز الحد المضبوط في الإعدادات."""
    if not settings.FINANCIAL_HOLD_ENABLED:
        return False
    student = session.get(Student, student_id)
    if student is not None and student.financial_hold_exempt:
        return False  # استثناء مباشر من المدير (له سبب موثَّق)
    amount, _ = overdue_total(session, student_id, today, settings.FINANCIAL_HOLD_GRACE_DAYS)
    return amount > settings.FINANCIAL_HOLD_THRESHOLD_AMOUNT


# ------------------------------------------------------------------ رمز التحقق من السند


def verification_code(receipt: PaymentReceipt) -> str:
    """HMAC مبني على بيانات السند؛ يُضمَّن في الـ QR ويتحقق منه الخادم دون كشف أي بيانات لمن لا يملكه."""
    message = f"{receipt.receipt_number}|{receipt.kind.value}|{q(receipt.amount)}|{receipt.paid_at.isoformat()}"
    return hmac.new(settings.SECRET_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()[:20]


def check_verification(receipt: PaymentReceipt, code: str) -> bool:
    return hmac.compare_digest(verification_code(receipt), code)


# ------------------------------------------------------------------ تعيين الرسوم


def assign_fee(
    session: Session,
    *,
    user: User,
    structure: FeeStructure,
    student: Student,
    discount_percent: Decimal,
    discount_reason: str | None,
    schedule: ScheduleSpec | None,
    explicit: list[InstallmentSpec] | None,
) -> StudentFee:
    """ينشئ حساب الرسم وأقساطه دون commit (المسؤول عن المعاملة هو المستدعي)."""
    if discount_percent > structure.max_discount_percent:
        raise FinanceError(f"الخصم ({discount_percent}%) يتجاوز المسموح لهذا الرسم ({structure.max_discount_percent}%)")
    due = q(structure.total_amount)
    discount = q(due * discount_percent / 100)
    net = q(due - discount)
    installments = build_installments(net, schedule, explicit)

    fee = StudentFee(
        student_id=student.id,
        fee_structure_id=structure.id,
        amount_due=due,
        discount_percent=discount_percent,
        discount_amount=discount,
        discount_reason=discount_reason,
        net_amount=net,
        paid_amount=Decimal(0),
        created_by=user.id,
    )
    session.add(fee)
    session.flush()
    for number, (due_date, amount) in enumerate(installments, start=1):
        session.add(
            PaymentPlan(student_fee_id=fee.id, installment_no=number, due_date=due_date, amount=amount, created_by=user.id)
        )
    session.flush()
    return fee


# ------------------------------------------------------------------ أرقام السندات


def next_receipt_number(session: Session, kind: ReceiptKind, today: date) -> str:
    """رقم فريد متسلسل لكل سنة. الـ UPDATE يقفل صف العدّاد حتى نهاية المعاملة فلا تتكرر الأرقام."""
    year = today.year
    for _ in range(3):
        updated = session.execute(
            update(ReceiptCounter).where(ReceiptCounter.year == year).values(last_value=ReceiptCounter.last_value + 1)
        ).rowcount
        if updated:
            break
        try:
            with session.begin_nested():
                session.add(ReceiptCounter(year=year, last_value=0))
        except IntegrityError:
            pass  # سبقتنا معاملة أخرى بإنشاء الصف؛ نعيد الـ UPDATE
    else:  # pragma: no cover
        raise FinanceError("تعذّر توليد رقم السند", 503)
    value = session.execute(select(ReceiptCounter.last_value).where(ReceiptCounter.year == year)).scalar_one()
    return f"{'R' if kind == ReceiptKind.PAYMENT else 'V'}-{year}-{value:06d}"


# ------------------------------------------------------------------ الدفع والعكس


def _apply_allocations(
    session: Session, *, user: User, fee: StudentFee, receipt: PaymentReceipt, amount: Decimal, installment_id: uuid.UUID | None
) -> None:
    installments = list(
        session.exec(
            select(PaymentPlan)
            .where(PaymentPlan.student_fee_id == fee.id)
            .order_by(PaymentPlan.due_date, PaymentPlan.installment_no)
            .with_for_update()
        ).all()
    )
    if installments:
        if installment_id is not None:
            target = next((i for i in installments if i.id == installment_id), None)
            if target is None:
                raise FinanceError("القسط غير تابع لهذا الحساب", 404)
            if amount > installment_remaining(target):
                raise FinanceError(f"المبلغ يتجاوز المتبقي من هذا القسط ({installment_remaining(target)})")
            chosen = [(target, amount)]
        else:
            chosen, left = [], amount
            for inst in installments:
                if left <= 0:
                    break
                part = min(left, installment_remaining(inst))
                if part > 0:
                    chosen.append((inst, part))
                    left -= part
            if left > 0:  # لا يحدث ما دام مجموع الأقساط = الصافي، لكنه حارس ضد بيانات تالفة
                raise FinanceError("تعذّر توزيع المبلغ على الأقساط")
        for inst, part in chosen:
            inst.paid_amount = q(Decimal(inst.paid_amount) + part)
            inst.updated_by = user.id
            session.add(inst)
            session.add(ReceiptAllocation(receipt_id=receipt.id, installment_id=inst.id, amount=part, created_by=user.id))
    elif installment_id is not None:
        raise FinanceError("هذا الحساب بلا أقساط")
    fee.paid_amount = q(Decimal(fee.paid_amount) + amount)
    fee.updated_by = user.id
    session.add(fee)


def record_payment(
    session: Session,
    *,
    user: User,
    student_fee_id: uuid.UUID,
    amount: Decimal,
    method: PaymentMethod,
    reference: str | None,
    paid_at: date | None,
    note: str | None,
    installment_id: uuid.UUID | None,
    idempotency_key: str | None,
    today: date | None = None,
) -> PaymentReceipt:
    today = today or date.today()
    paid_at = paid_at or today
    if paid_at > today:
        raise FinanceError("لا يجوز تسجيل دفعة بتاريخ مستقبلي")
    amount = q(amount)
    try:
        if idempotency_key:
            existing = session.exec(select(PaymentReceipt).where(PaymentReceipt.idempotency_key == idempotency_key)).first()
            if existing is not None:
                if existing.student_fee_id != student_fee_id or q(existing.amount) != amount or existing.created_by != user.id:
                    raise FinanceError("مفتاح التكرار مستخدم لعملية مختلفة", 409)
                return existing  # إعادة إرسال نفس الطلب: نُرجع السند الأول بلا تكرار
        fee = session.get(StudentFee, student_fee_id, with_for_update=True)
        if fee is None:
            raise FinanceError("حساب الرسوم غير موجود", 404)
        remaining = q(Decimal(fee.net_amount) - Decimal(fee.paid_amount))
        if amount > remaining:
            raise FinanceError(f"المبلغ ({amount}) يتجاوز المتبقي على الحساب ({remaining})")
        if method == PaymentMethod.TRANSFER and not reference:
            raise FinanceError("رقم الحوالة (المرجع) مطلوب لدفعات الحوالة")
        receipt = PaymentReceipt(
            receipt_number=next_receipt_number(session, ReceiptKind.PAYMENT, today),
            kind=ReceiptKind.PAYMENT,
            student_fee_id=fee.id,
            student_id=fee.student_id,
            amount=amount,
            method=method,
            reference=reference,
            paid_at=paid_at,
            note=note,
            idempotency_key=idempotency_key,
            created_by=user.id,
        )
        session.add(receipt)
        session.flush()
        _apply_allocations(session, user=user, fee=fee, receipt=receipt, amount=amount, installment_id=installment_id)
        session.commit()
        session.refresh(receipt)
        return receipt
    except IntegrityError:
        session.rollback()
        raise FinanceError("تعذّر حفظ السند (تعارض)، أعد المحاولة", 409)
    except Exception:
        session.rollback()
        raise


def reverse_receipt(
    session: Session, *, user: User, receipt_id: uuid.UUID, reason: str, today: date | None = None
) -> PaymentReceipt:
    today = today or date.today()
    try:
        original = session.get(PaymentReceipt, receipt_id, with_for_update=True)
        if original is None:
            raise FinanceError("السند غير موجود", 404)
        if original.kind != ReceiptKind.PAYMENT:
            raise FinanceError("لا يمكن عكس سند عكس")
        if session.exec(select(PaymentReceipt.id).where(PaymentReceipt.reversal_of_id == original.id)).first() is not None:
            raise FinanceError("هذا السند معكوس مسبقًا", 409)
        fee = session.get(StudentFee, original.student_fee_id, with_for_update=True)
        new_paid = q(Decimal(fee.paid_amount) - Decimal(original.amount))
        if new_paid < 0:
            raise FinanceError("رصيد الحساب لا يسمح بالعكس")  # حارس ضد بيانات تالفة

        reversal = PaymentReceipt(
            receipt_number=next_receipt_number(session, ReceiptKind.REVERSAL, today),
            kind=ReceiptKind.REVERSAL,
            student_fee_id=original.student_fee_id,
            student_id=original.student_id,
            amount=original.amount,
            method=original.method,
            reference=original.reference,
            paid_at=today,
            reversal_of_id=original.id,
            reversal_reason=reason,
            created_by=user.id,
        )
        session.add(reversal)
        session.flush()
        for alloc in session.exec(select(ReceiptAllocation).where(ReceiptAllocation.receipt_id == original.id)).all():
            inst = session.get(PaymentPlan, alloc.installment_id, with_for_update=True)
            inst.paid_amount = q(Decimal(inst.paid_amount) - Decimal(alloc.amount))
            inst.updated_by = user.id
            session.add(inst)
        fee.paid_amount = new_paid
        fee.updated_by = user.id
        session.add(fee)
        session.commit()
        session.refresh(reversal)
        return reversal
    except IntegrityError:
        session.rollback()
        raise FinanceError("هذا السند معكوس مسبقًا", 409)
    except Exception:
        session.rollback()
        raise

