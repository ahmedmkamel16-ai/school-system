from datetime import datetime

from pydantic import BaseModel


class DailyAttendancePoint(BaseModel):
    date: str
    label: str
    rate: float
    present_count: int
    total_count: int


class CoverageSlot(BaseModel):
    day: str
    period_number: int
    classroom_name: str
    subject_name: str


class TeacherAbsenceInfo(BaseModel):
    teacher_id: int
    teacher_name: str
    status: str
    periods_needing_coverage: list[CoverageSlot]


class ScheduleHealth(BaseModel):
    classrooms_with_incomplete_schedule: int
    teachers_without_grade_scope: int
    subjects_without_teacher: int


class RecentActivityItem(BaseModel):
    actor_name: str
    description: str
    created_at: datetime


class DashboardSummary(BaseModel):
    total_students: int
    total_teachers: int
    total_classrooms: int
    today_attendance_rate: float
    today_present_count: int
    today_total_students: int
    new_students_this_month: int
    weekly_attendance: list[DailyAttendancePoint]
    teachers_absent_today: list[TeacherAbsenceInfo]
    schedule_health: ScheduleHealth
    recent_activity: list[RecentActivityItem]
