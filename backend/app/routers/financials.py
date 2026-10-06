"""مسارات النظام المالي.

الصلاحيات:
  * المدير (أو المفوَّض): كل شيء، وهو وحده من يضع الرسوم ويطبّق الخصومات ويعكس السندات.
  * المحاسب: يعيّن الأقساط (بلا خصم)، يسجّل الدفعات، يقرأ الكشوف والمتأخرات.
  * ولي الأمر: كشف حساب أبنائه فقط (بلا بيانات المحصِّل أو الملاحظات الداخلية).
  * المعلم: لا وصول.
"""

import uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import func, select

from app.core.audit import log_action
from app.core.config import settings
from app.core.deps import CurrentUser, SessionDep
from app.core.finance import (
    HOLD_MESSAGE,
    FinanceError,
    assign_fee,
    check_verification,
    has_financial_hold,
    installment_remaining,
    installment_status,
    overdue_installments,
    q,
    record_payment,
    reverse_receipt,
    verification_code,
)
from app.core.grading import is_admin
from app.models.classroom import ClassRoom
from app.models.financials import (
    DefaulterRead,
    FeeStructure,
    FeeStructureCreate,
    FeeStructureRead,
    FinancialSummaryRead,
    GuardianReceiptRead,
    GuardianStatementRead,
    InstallmentRead,
    InstallmentStatus,
    MethodTotal,
    PaymentPlan,
    PaymentReceipt,
    PlanCreate,
    PlanCreateResult,
    ReceiptAllocation,
    ReceiptCreate,
    ReceiptKind,
    ReceiptRead,
    ReceiptReverse,
    ReceiptVerifyRead,
    StatementRead,
    StatementTotals,
    StudentFee,
    StudentFeeRead,
)
from app.models.student import Student, StudentStatus
from app.models.user import User, UserRole

router = APIRouter(prefix="/financials", tags=["financials"])


def _fail(error: FinanceError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.message)


def _forbidden(detail: str = "لا تملك صلاحية الوصول للبيانات المالية") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _require_finance_staff(user: User) -> None:
    if not (is_admin(user) or user.role == UserRole.ACCOUNTANT):
        raise _forbidden()


# ---------------------------------------------------------------- بناء المخرجات


def _fees_to_read(session: SessionDep, fees: list[StudentFee], today: date) -> list[StudentFeeRead]:
    if not fees:
        return []
    structures = {
        s.id: s
        for s in session.exec(select(FeeStructure).where(FeeStructure.id.in_({f.fee_structure_id for f in fees}))).all()
    }
    by_fee: dict[uuid.UUID, list[PaymentPlan]] = defaultdict(list)
    for inst in session.exec(
        select(PaymentPlan)
        .where(PaymentPlan.student_fee_id.in_([f.id for f in fees]))
        .order_by(PaymentPlan.due_date, PaymentPlan.installment_no)
    ).all():
        by_fee[inst.student_fee_id].append(inst)
    result = []
    for fee in fees:
        structure = structures[fee.fee_structure_id]
        installments = [
            InstallmentRead(
                id=i.id,
                installment_no=i.installment_no,
                due_date=i.due_date,
                amount=i.amount,
                paid_amount=i.paid_amount,
                remaining=installment_remaining(i),
                status=installment_status(i, today),
                days_overdue=max(0, (today - i.due_date).days) if installment_remaining(i) > 0 else 0,
            )
            for i in by_fee[fee.id]
        ]
        result.append(
            StudentFeeRead(
                id=fee.id,
                fee_structure_id=fee.fee_structure_id,
                fee_name=structure.name,
                academic_year=structure.academic_year,
                term=structure.term,
                amount_due=fee.amount_due,
                discount_percent=fee.discount_percent,
                discount_amount=fee.discount_amount,
                discount_reason=fee.discount_reason,
                net_amount=fee.net_amount,
                paid_amount=fee.paid_amount,
                remaining_amount=q(Decimal(fee.net_amount) - Decimal(fee.paid_amount)),
                installments=installments,
            )
        )
    return result


def _receipts_to_read(session: SessionDep, receipts: list[PaymentReceipt]) -> list[ReceiptRead]:
    if not receipts:
        return []
    ids = [r.id for r in receipts]
    reversed_ids = set(
        session.exec(select(PaymentReceipt.reversal_of_id).where(PaymentReceipt.reversal_of_id.in_(ids))).all()
    )
    students = {
        s.id: s.full_name
        for s in session.exec(select(Student).where(Student.id.in_({r.student_id for r in receipts}))).all()
    }
    fee_names = dict(
        session.exec(
            select(StudentFee.id, FeeStructure.name)
            .join(FeeStructure, FeeStructure.id == StudentFee.fee_structure_id)
            .where(StudentFee.id.in_({r.student_fee_id for r in receipts}))
        ).all()
    )
    collectors = {
        u.id: u.full_name for u in session.exec(select(User).where(User.id.in_({r.created_by for r in receipts}))).all()
    }
    allocations: dict[uuid.UUID, list] = defaultdict(list)
    for alloc, number in session.exec(
        select(ReceiptAllocation, PaymentPlan.installment_no)
        .join(PaymentPlan, PaymentPlan.id == ReceiptAllocation.installment_id)
        .where(ReceiptAllocation.receipt_id.in_(ids))
    ).all():
        allocations[alloc.receipt_id].append(
            {"installment_id": alloc.installment_id, "installment_no": number, "amount": alloc.amount}
        )
    return [
        ReceiptRead.model_validate(
            {
                **r.model_dump(),
                "student_name": students.get(r.student_id),
                "fee_name": fee_names.get(r.student_fee_id),
                "is_reversed": r.id in reversed_ids,
                "collected_by": r.created_by,
                "collected_by_name": collectors.get(r.created_by),
                "verification_code": verification_code(r),
                "allocations": allocations.get(r.id, []),
            }
        )
        for r in receipts
    ]


def _totals(fees: list[StudentFeeRead]) -> StatementTotals:
    overdue = [i for f in fees for i in f.installments if i.status == InstallmentStatus.OVERDUE]
    return StatementTotals(
        net_total=q(sum((f.net_amount for f in fees), Decimal(0))),
        paid_total=q(sum((f.paid_amount for f in fees), Decimal(0))),
        remaining_total=q(sum((f.remaining_amount for f in fees), Decimal(0))),
        overdue_amount=q(sum((i.remaining for i in overdue), Decimal(0))),
        overdue_count=len(overdue),
    )


def _classroom_name(session: SessionDep, student: Student) -> str | None:
    classroom = session.get(ClassRoom, student.classroom_id) if student.classroom_id else None
    return classroom.name if classroom else None


# ---------------------------------------------------------------- الرسوم المقررة


@router.post("/fee-structures", response_model=FeeStructureRead, status_code=status.HTTP_201_CREATED)
def create_fee_structure(payload: FeeStructureCreate, session: SessionDep, current_user: CurrentUser) -> FeeStructure:
    if not is_admin(current_user):
        raise _forbidden("تحديد الرسوم من صلاحيات المدير فقط")
    structure = FeeStructure(**payload.model_dump(), created_by=current_user.id)
    session.add(structure)
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="يوجد رسم بنفس الاسم لهذا الصف والعام")
    session.refresh(structure)
    log_action(session, current_user, "create", "fee_structure", None, f"إنشاء رسم «{structure.name}» ({structure.id})")
    return structure


@router.get("/fee-structures", response_model=list[FeeStructureRead])
def list_fee_structures(
    session: SessionDep, current_user: CurrentUser, academic_year: str | None = Query(default=None)
) -> list[FeeStructure]:
    _require_finance_staff(current_user)
    query = select(FeeStructure).order_by(FeeStructure.academic_year.desc(), FeeStructure.grade_level, FeeStructure.name)
    if academic_year:
        query = query.where(FeeStructure.academic_year == academic_year.replace("/", "-"))
    return list(session.exec(query).all())


# ---------------------------------------------------------------- الأقساط


@router.post("/plans", response_model=PlanCreateResult, status_code=status.HTTP_201_CREATED)
def create_plans(payload: PlanCreate, session: SessionDep, current_user: CurrentUser) -> PlanCreateResult:
    """يعيّن رسمًا مع جدول أقساط لطالب أو لكل طلاب فصل، بمعاملة واحدة (إما الكل أو لا شيء)."""
    _require_finance_staff(current_user)
    if payload.discount_percent > 0 and not is_admin(current_user):
        raise _forbidden("تطبيق الخصومات من صلاحيات المدير فقط")
    structure = session.get(FeeStructure, payload.fee_structure_id)
    if structure is None or not structure.is_active:
        raise _not_found("الرسم المقرر غير موجود أو غير فعّال")

    if payload.student_id is not None:
        student = session.get(Student, payload.student_id)
        if student is None:
            raise _not_found("الطالب غير موجود")
        if student.grade_level != structure.grade_level:
            raise HTTPException(status_code=422, detail="صف الطالب لا يطابق صف الرسم المقرر")
        targets = [student]
    else:
        classroom = session.get(ClassRoom, payload.classroom_id)
        if classroom is None:
            raise _not_found("الفصل غير موجود")
        if classroom.grade_level != structure.grade_level:
            raise HTTPException(status_code=422, detail="صف الفصل لا يطابق صف الرسم المقرر")
        targets = list(
            session.exec(
                select(Student).where(Student.classroom_id == classroom.id, Student.status != StudentStatus.TRANSFERRED)
            ).all()
        )
        if not targets:
            raise HTTPException(status_code=422, detail="لا يوجد طلاب في هذا الفصل")

    already = {
        sid
        for sid in session.exec(
            select(StudentFee.student_id).where(
                StudentFee.fee_structure_id == structure.id, StudentFee.student_id.in_([t.id for t in targets])
            )
        ).all()
    }
    created, skipped, fee_ids = [], [], []
    try:
        for student in targets:
            if student.id in already:
                skipped.append(student.id)
                continue
            fee = assign_fee(
                session,
                user=current_user,
                structure=structure,
                student=student,
                discount_percent=payload.discount_percent,
                discount_reason=payload.discount_reason,
                schedule=payload.schedule,
                explicit=payload.installments,
            )
            created.append(student.id)
            fee_ids.append(fee.id)
        session.commit()
    except FinanceError as error:
        session.rollback()
        raise _fail(error)
    except Exception:
        session.rollback()
        raise
    log_action(
        session, current_user, "create", "payment_plan", None,
        f"إنشاء أقساط «{structure.name}» لـ {len(created)} طالب (تخطّي {len(skipped)})",
    )
    return PlanCreateResult(created_student_ids=created, skipped_student_ids=skipped, fee_ids=fee_ids)


# ---------------------------------------------------------------- السندات


@router.post("/receipts", response_model=ReceiptRead, status_code=status.HTTP_201_CREATED)
def create_receipt(payload: ReceiptCreate, session: SessionDep, current_user: CurrentUser) -> ReceiptRead:
    _require_finance_staff(current_user)
    try:
        receipt = record_payment(
            session,
            user=current_user,
            student_fee_id=payload.student_fee_id,
            amount=payload.amount,
            method=payload.method,
            reference=payload.reference,
            paid_at=payload.paid_at,
            note=payload.note,
            installment_id=payload.installment_id,
            idempotency_key=payload.idempotency_key,
        )
    except FinanceError as error:
        raise _fail(error)
    log_action(
        session, current_user, "create", "payment_receipt", None,
        f"سند قبض {receipt.receipt_number} بمبلغ {receipt.amount} للطالب {receipt.student_id}",
    )
    return _receipts_to_read(session, [receipt])[0]


@router.get("/receipts", response_model=list[ReceiptRead])
def list_receipts(
    session: SessionDep,
    current_user: CurrentUser,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[ReceiptRead]:
    _require_finance_staff(current_user)
    query = select(PaymentReceipt)
    if date_from:
        query = query.where(PaymentReceipt.paid_at >= date_from)
    if date_to:
        query = query.where(PaymentReceipt.paid_at <= date_to)
    query = query.order_by(PaymentReceipt.created_at.desc()).offset(offset).limit(limit)
    return _receipts_to_read(session, list(session.exec(query).all()))


@router.get("/receipts/verify", response_model=ReceiptVerifyRead)
def verify_receipt(session: SessionDep, number: str = Query(max_length=32), code: str = Query(max_length=64)) -> ReceiptVerifyRead:
    """تحقق عام من سند عبر الـ QR. بلا رمز صحيح لا تُكشف أي بيانات (valid=false فقط)."""
    receipt = session.exec(select(PaymentReceipt).where(PaymentReceipt.receipt_number == number)).first()
    if receipt is None or not check_verification(receipt, code):
        return ReceiptVerifyRead(valid=False)
    is_reversed = session.exec(select(PaymentReceipt.id).where(PaymentReceipt.reversal_of_id == receipt.id)).first() is not None
    return ReceiptVerifyRead(
        valid=True,
        receipt_number=receipt.receipt_number,
        kind=receipt.kind,
        amount=receipt.amount,
        paid_at=receipt.paid_at,
        reversed=is_reversed,
    )


@router.get("/receipts/{receipt_id}", response_model=ReceiptRead)
def get_receipt(receipt_id: uuid.UUID, session: SessionDep, current_user: CurrentUser) -> ReceiptRead:
    _require_finance_staff(current_user)
    receipt = session.get(PaymentReceipt, receipt_id)
    if receipt is None:
        raise _not_found("السند غير موجود")
    return _receipts_to_read(session, [receipt])[0]


@router.post("/receipts/{receipt_id}/reverse", response_model=ReceiptRead, status_code=status.HTTP_201_CREATED)
def reverse(receipt_id: uuid.UUID, payload: ReceiptReverse, session: SessionDep, current_user: CurrentUser) -> ReceiptRead:
    """عكس سند دفع بسند جديد (المدير فقط). السند الأصلي لا يتغير مطلقًا."""
    if not is_admin(current_user):
        raise _forbidden("عكس السندات من صلاحيات المدير فقط")
    try:
        reversal = reverse_receipt(session, user=current_user, receipt_id=receipt_id, reason=payload.reason)
    except FinanceError as error:
        raise _fail(error)
    log_action(
        session, current_user, "create", "payment_reversal", None,
        f"سند عكس {reversal.receipt_number} للسند {reversal.reversal_of_id}: {payload.reason}",
    )
    return _receipts_to_read(session, [reversal])[0]


# ---------------------------------------------------------------- كشف الحساب


@router.get("/students/{student_id}/statement", response_model=StatementRead | GuardianStatementRead)
def get_statement(student_id: int, session: SessionDep, current_user: CurrentUser):
    """كشف الحساب: نسخة كاملة للمحاسب/المدير، ونسخة مقيّدة لولي أمر الطالب فقط."""
    today = date.today()
    if current_user.role == UserRole.PARENT:
        student = session.exec(
            select(Student).where(Student.id == student_id, Student.guardian_user_id == current_user.id)
        ).first()
        guardian = True
    else:
        _require_finance_staff(current_user)
        student = session.get(Student, student_id)
        guardian = False
    if student is None:
        raise _not_found("الطالب غير موجود")

    fees = _fees_to_read(session, list(session.exec(select(StudentFee).where(StudentFee.student_id == student.id)).all()), today)
    receipts = _receipts_to_read(
        session,
        list(
            session.exec(
                select(PaymentReceipt)
                .where(PaymentReceipt.student_id == student.id)
                .order_by(PaymentReceipt.created_at.desc())
            ).all()
        ),
    )
    hold = has_financial_hold(session, student.id, today)
    if guardian:
        return GuardianStatementRead(
            student_name=student.full_name,
            classroom_name=_classroom_name(session, student),
            fees=fees,
            receipts=[GuardianReceiptRead.model_validate(r.model_dump()) for r in receipts],
            totals=_totals(fees),
            financial_hold=hold,
            hold_message=HOLD_MESSAGE if hold else None,
        )
    return StatementRead(
        student_id=student.id,
        student_name=student.full_name,
        classroom_name=_classroom_name(session, student),
        fees=fees,
        receipts=receipts,
        totals=_totals(fees),
        financial_hold=hold,
    )


# ---------------------------------------------------------------- المتأخرون والملخص


def _overdue_by_student(session: SessionDep, today: date):
    """{student_id: [(installment, fee)]} للأقساط المتأخرة فعليًا (بلا فترة سماح)."""
    grouped: dict[int, list] = defaultdict(list)
    for inst, fee in overdue_installments(session, None, today, 0):
        grouped[fee.student_id].append((inst, fee))
    return grouped


def _is_held(rows: list, today: date) -> bool:
    if not settings.FINANCIAL_HOLD_ENABLED:
        return False
    cutoff = today - timedelta(days=settings.FINANCIAL_HOLD_GRACE_DAYS)
    amount = sum((installment_remaining(i) for i, _ in rows if i.due_date < cutoff), Decimal(0))
    return q(amount) > settings.FINANCIAL_HOLD_THRESHOLD_AMOUNT


@router.get("/defaulters", response_model=list[DefaulterRead])
def defaulters(
    session: SessionDep,
    current_user: CurrentUser,
    classroom_id: int | None = Query(default=None),
    min_overdue: Annotated[Decimal, Query(ge=0)] = Decimal("0"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[DefaulterRead]:
    _require_finance_staff(current_user)
    today = date.today()
    grouped = _overdue_by_student(session, today)
    if not grouped:
        return []
    students = {
        s.id: s for s in session.exec(select(Student).where(Student.id.in_(list(grouped)))).all()
    }
    classrooms = {c.id: c.name for c in session.exec(select(ClassRoom)).all()}
    remaining_totals: dict[int, Decimal] = defaultdict(Decimal)
    for fee in session.exec(select(StudentFee).where(StudentFee.student_id.in_(list(grouped)))).all():
        remaining_totals[fee.student_id] += Decimal(fee.net_amount) - Decimal(fee.paid_amount)

    rows = []
    for sid, items in grouped.items():
        student = students.get(sid)
        if student is None or (classroom_id is not None and student.classroom_id != classroom_id):
            continue
        amount = q(sum((installment_remaining(i) for i, _ in items), Decimal(0)))
        if amount < min_overdue or amount <= 0:
            continue
        oldest = min(i.due_date for i, _ in items)
        rows.append(
            DefaulterRead(
                student_id=sid,
                student_name=student.full_name,
                classroom_name=classrooms.get(student.classroom_id),
                guardian_name=student.guardian_name,
                guardian_phone=student.guardian_phone,
                overdue_amount=amount,
                overdue_installments=len(items),
                oldest_due_date=oldest,
                days_overdue=(today - oldest).days,
                remaining_total=q(remaining_totals[sid]),
                financial_hold=_is_held(items, today),
            )
        )
    rows.sort(key=lambda r: (-r.overdue_amount, r.student_name))
    return rows[offset : offset + limit]


@router.get("/summary", response_model=FinancialSummaryRead)
def summary(
    session: SessionDep,
    current_user: CurrentUser,
    as_of: date | None = Query(default=None),
    academic_year: str | None = Query(default=None),
) -> FinancialSummaryRead:
    """إحصائيات لوحة المحاسب: مقبوضات اليوم والشهر (صافي بعد السندات العاكسة)، التحصيل، المتأخرات."""
    _require_finance_staff(current_user)
    today = as_of or date.today()
    month_start = today.replace(day=1)

    def net(rows: list[PaymentReceipt]) -> Decimal:
        return q(sum((r.amount if r.kind == ReceiptKind.PAYMENT else -r.amount for r in rows), Decimal(0)))

    month_rows = list(
        session.exec(select(PaymentReceipt).where(PaymentReceipt.paid_at >= month_start, PaymentReceipt.paid_at <= today)).all()
    )
    today_rows = [r for r in month_rows if r.paid_at == today]
    by_method: dict = defaultdict(list)
    for r in today_rows:
        by_method[r.method].append(r)

    fee_query = select(StudentFee)
    if academic_year:
        fee_query = fee_query.join(FeeStructure, FeeStructure.id == StudentFee.fee_structure_id).where(
            FeeStructure.academic_year == academic_year.replace("/", "-")
        )
    fees = list(session.exec(fee_query).all())
    net_total = q(sum((Decimal(f.net_amount) for f in fees), Decimal(0)))
    paid_total = q(sum((Decimal(f.paid_amount) for f in fees), Decimal(0)))

    grouped = _overdue_by_student(session, today)
    overdue_amount = q(sum((installment_remaining(i) for items in grouped.values() for i, _ in items), Decimal(0)))
    return FinancialSummaryRead(
        as_of=today,
        today_collected=net(today_rows),
        today_receipts=len(today_rows),
        month_collected=net(month_rows),
        net_total=net_total,
        paid_total=paid_total,
        remaining_total=q(net_total - paid_total),
        collection_rate=q(paid_total / net_total * 100) if net_total > 0 else Decimal("0.00"),
        overdue_amount=overdue_amount,
        overdue_students=len(grouped),
        held_students=sum(1 for items in grouped.values() if _is_held(items, today)),
        by_method_today=[MethodTotal(method=m, total=net(rows), count=len(rows)) for m, rows in by_method.items()],
    )
