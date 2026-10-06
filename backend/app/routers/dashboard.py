from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.core.deps import CurrentUser, SessionDep
from app.models.attendance import Attendance, AttendanceStatus
from app.models.audit import AuditLog
from app.models.classroom import ClassRoom
from app.models.curriculum import CurriculumRequirement
from app.models.student import Student, StudentStatus
from app.models.subject import Subject
from app.models.teacher import Teacher, TeacherGrade, TeacherStatus, TeacherSubject
from app.models.teacher_attendance import TeacherAttendance, TeacherAttendanceStatus
from app.models.timetable import TimetableSlot, Weekday
from app.models.user import UserRole
from app.schemas.dashboard import (
    CoverageSlot,
    DailyAttendancePoint,
    DashboardSummary,
    RecentActivityItem,
    ScheduleHealth,
    TeacherAbsenceInfo,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

WEEKDAY_LABELS_AR = {
    Weekday.SUNDAY: "الأحد",
    Weekday.MONDAY: "الاثنين",
    Weekday.TUESDAY: "الثلاثاء",
    Weekday.WEDNESDAY: "الأربعاء",
    Weekday.THURSDAY: "الخميس",
}

# Python's date.weekday(): Monday=0 ... Sunday=6. School week is Sun-Thu.
PY_WEEKDAY_TO_ENUM = {
    6: Weekday.SUNDAY,
    0: Weekday.MONDAY,
    1: Weekday.TUESDAY,
    2: Weekday.WEDNESDAY,
    3: Weekday.THURSDAY,
}


def _attendance_rate_for(session: SessionDep, target_date: date, active_student_ids: set[int]) -> tuple[float, int, int]:
    if not active_student_ids:
        return 0.0, 0, 0
    records = session.exec(
        select(Attendance).where(Attendance.attendance_date == target_date)
    ).all()
    present_count = sum(
        1
        for r in records
        if r.student_id in active_student_ids
        and r.status in (AttendanceStatus.PRESENT, AttendanceStatus.LATE)
    )
    total = len(active_student_ids)
    rate = round((present_count / total) * 100, 1) if total else 0.0
    return rate, present_count, total


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(session: SessionDep, current_user: CurrentUser) -> DashboardSummary:
    if current_user.role == UserRole.PARENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="لا تملك صلاحية عرض هذه البيانات")

    today = date.today()

    active_students = session.exec(
        select(Student).where(Student.status == StudentStatus.ACTIVE)
    ).all()
    active_student_ids = {s.id for s in active_students}
    total_classrooms = len(session.exec(select(ClassRoom)).all())
    total_teachers = len(session.exec(select(Teacher).where(Teacher.status == TeacherStatus.ACTIVE)).all())

    today_rate, today_present, today_total = _attendance_rate_for(session, today, active_student_ids)

    month_start = today.replace(day=1)
    new_students_this_month = sum(
        1 for s in active_students if s.created_at.date() >= month_start
    )

    # last 5 school days (Sun-Thu) ending today
    weekly_points: list[DailyAttendancePoint] = []
    cursor = today
    while len(weekly_points) < 5:
        if cursor.weekday() in PY_WEEKDAY_TO_ENUM:
            rate, present, total = _attendance_rate_for(session, cursor, active_student_ids)
            weekly_points.append(
                DailyAttendancePoint(
                    date=cursor.isoformat(),
                    label=WEEKDAY_LABELS_AR[PY_WEEKDAY_TO_ENUM[cursor.weekday()]],
                    rate=rate,
                    present_count=present,
                    total_count=total,
                )
            )
        cursor -= timedelta(days=1)
    weekly_points.reverse()

    # teachers absent/on leave today + which of their periods need a substitute
    absent_records = session.exec(
        select(TeacherAttendance).where(
            TeacherAttendance.attendance_date == today,
            TeacherAttendance.status.in_([TeacherAttendanceStatus.ABSENT, TeacherAttendanceStatus.LEAVE]),
        )
    ).all()
    teachers_absent_today: list[TeacherAbsenceInfo] = []
    today_weekday_enum = PY_WEEKDAY_TO_ENUM.get(today.weekday())
    for record in absent_records:
        teacher = session.get(Teacher, record.teacher_id)
        if not teacher:
            continue
        coverage: list[CoverageSlot] = []
        if today_weekday_enum:
            slots = session.exec(
                select(TimetableSlot).where(
                    TimetableSlot.teacher_id == record.teacher_id,
                    TimetableSlot.day == today_weekday_enum,
                )
            ).all()
            for slot in sorted(slots, key=lambda s: s.period_number):
                classroom = session.get(ClassRoom, slot.classroom_id)
                subject = session.get(Subject, slot.subject_id)
                coverage.append(
                    CoverageSlot(
                        day=WEEKDAY_LABELS_AR[today_weekday_enum],
                        period_number=slot.period_number,
                        classroom_name=classroom.name if classroom else "?",
                        subject_name=subject.name if subject else "?",
                    )
                )
        teachers_absent_today.append(
            TeacherAbsenceInfo(
                teacher_id=teacher.id,
                teacher_name=teacher.full_name,
                status=record.status.value,
                periods_needing_coverage=coverage,
            )
        )

    # schedule health
    classrooms = session.exec(select(ClassRoom)).all()
    incomplete_count = 0
    for classroom in classrooms:
        requirements = session.exec(
            select(CurriculumRequirement).where(
                CurriculumRequirement.grade_level == classroom.grade_level
            )
        ).all()
        required_total = sum(r.periods_per_week for r in requirements)
        if required_total <= 0:
            continue
        actual_total = len(
            session.exec(
                select(TimetableSlot).where(TimetableSlot.classroom_id == classroom.id)
            ).all()
        )
        if actual_total < required_total:
            incomplete_count += 1

    teachers_with_grade = {tg.teacher_id for tg in session.exec(select(TeacherGrade)).all()}
    active_teachers = session.exec(select(Teacher).where(Teacher.status == TeacherStatus.ACTIVE)).all()
    teachers_without_grade_scope = sum(1 for t in active_teachers if t.id not in teachers_with_grade)

    subjects_with_teacher = {ts.subject_id for ts in session.exec(select(TeacherSubject)).all()}
    all_subjects = session.exec(select(Subject)).all()
    subjects_without_teacher = sum(1 for s in all_subjects if s.id not in subjects_with_teacher)

    schedule_health = ScheduleHealth(
        classrooms_with_incomplete_schedule=incomplete_count,
        teachers_without_grade_scope=teachers_without_grade_scope,
        subjects_without_teacher=subjects_without_teacher,
    )

    recent_logs = session.exec(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(5)
    ).all()
    recent_activity = [
        RecentActivityItem(
            actor_name=log.actor_name, description=log.description, created_at=log.created_at
        )
        for log in recent_logs
    ]

    return DashboardSummary(
        total_students=len(active_students),
        total_teachers=total_teachers,
        total_classrooms=total_classrooms,
        today_attendance_rate=today_rate,
        today_present_count=today_present,
        today_total_students=today_total,
        new_students_this_month=new_students_this_month,
        weekly_attendance=weekly_points,
        teachers_absent_today=teachers_absent_today,
        schedule_health=schedule_health,
        recent_activity=recent_activity,
    )
