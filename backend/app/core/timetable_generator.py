from collections import defaultdict

from sqlmodel import select

from app.core.deps import SessionDep
from app.models.classroom import ClassRoom
from app.models.curriculum import CurriculumRequirement
from app.models.subject import Subject
from app.models.teacher import Teacher, TeacherGrade, TeacherSubject
from app.models.timetable import TimetableSlot, Weekday

DAYS = list(Weekday)
PERIODS = range(1, 8)


def generate_timetable(session: SessionDep) -> tuple[int, list[str]]:
    """Greedily fill empty timetable slots across all classrooms.

    Respects: curriculum weekly period targets per grade, teacher subject
    qualifications, no teacher double-booking, teacher max weekly load, and
    spreads a subject's periods across different days and period-numbers
    within a classroom, and spreads each period position (first, last, or
    any period in between) fairly across teachers school-wide.
    Existing (manually-set) slots are never touched or overwritten.
    """
    warnings: list[str] = []
    classrooms = session.exec(select(ClassRoom)).all()
    existing_slots = session.exec(select(TimetableSlot)).all()
    subjects_map = {s.id: s.name for s in session.exec(select(Subject)).all()}
    teachers = {t.id: t for t in session.exec(select(Teacher)).all()}

    classroom_busy: dict[int, set[tuple[str, int]]] = defaultdict(set)
    teacher_busy: dict[int, set[tuple[str, int]]] = defaultdict(set)
    teacher_load: dict[int, int] = defaultdict(int)
    # (teacher_id, period_number) -> how many times this teacher already holds
    # that specific period slot school-wide (first, last, or any period in
    # between) — used to spread each period position fairly across teachers
    teacher_period_position_count: dict[tuple[int, int], int] = defaultdict(int)
    classroom_subject_count: dict[tuple[int, int], int] = defaultdict(int)
    classroom_subject_days: dict[tuple[int, int], set[str]] = defaultdict(set)
    classroom_subject_periods: dict[tuple[int, int], set[int]] = defaultdict(set)

    for slot in existing_slots:
        classroom_busy[slot.classroom_id].add((slot.day.value, slot.period_number))
        teacher_busy[slot.teacher_id].add((slot.day.value, slot.period_number))
        teacher_load[slot.teacher_id] += 1
        teacher_period_position_count[(slot.teacher_id, slot.period_number)] += 1
        key = (slot.classroom_id, slot.subject_id)
        classroom_subject_count[key] += 1
        classroom_subject_days[key].add(slot.day.value)
        classroom_subject_periods[key].add(slot.period_number)

    teacher_ids_by_subject: dict[int, set[int]] = defaultdict(set)
    for ts in session.exec(select(TeacherSubject)).all():
        teacher_ids_by_subject[ts.subject_id].add(ts.teacher_id)

    teacher_grade_levels: dict[int, set[str]] = defaultdict(set)
    for tg in session.exec(select(TeacherGrade)).all():
        teacher_grade_levels[tg.teacher_id].add(tg.grade_level)

    def teaches_grade(teacher_id: int, grade_level: str) -> bool:
        scope = teacher_grade_levels.get(teacher_id)
        return not scope or grade_level in scope

    warned_grades: set[str] = set()
    warned_subjects: set[tuple[int, int]] = set()
    created = 0
    new_slots: list[TimetableSlot] = []

    for classroom in classrooms:
        requirements = session.exec(
            select(CurriculumRequirement).where(
                CurriculumRequirement.grade_level == classroom.grade_level
            )
        ).all()
        if not requirements:
            if classroom.grade_level not in warned_grades:
                warned_grades.add(classroom.grade_level)
                warnings.append(f"لم يتم تحديد منهج لصف {classroom.grade_level}")
            continue

        # place subjects with the largest remaining need first (harder to fit)
        requirements = sorted(requirements, key=lambda r: -r.periods_per_week)

        for requirement in requirements:
            key = (classroom.id, requirement.subject_id)
            remaining = requirement.periods_per_week - classroom_subject_count[key]
            if remaining <= 0:
                continue

            all_subject_teachers = teacher_ids_by_subject.get(requirement.subject_id, set())
            qualified_teacher_ids = {
                tid for tid in all_subject_teachers if teaches_grade(tid, classroom.grade_level)
            }
            if not qualified_teacher_ids:
                if key not in warned_subjects:
                    warned_subjects.add(key)
                    subject_name = subjects_map.get(requirement.subject_id, "?")
                    if all_subject_teachers:
                        warnings.append(
                            f"يوجد معلمون لمادة {subject_name} لكن غير مخصَّصين لصف "
                            f"{classroom.grade_level} ({classroom.name})"
                        )
                    else:
                        warnings.append(f"لا يوجد معلم مؤهل لمادة {subject_name} ({classroom.name})")
                continue

            for _ in range(remaining):
                candidates = [
                    (day.value, period)
                    for day in DAYS
                    for period in PERIODS
                    if (day.value, period) not in classroom_busy[classroom.id]
                ]
                # prefer days AND period-numbers this subject hasn't already used
                # this week, so it doesn't systematically pile up on the same
                # late (or early) periods every day
                candidates.sort(
                    key=lambda dp: (
                        dp[0] in classroom_subject_days[key],
                        dp[1] in classroom_subject_periods[key],
                    )
                )

                placed = False
                for day_value, period in candidates:
                    available_teachers = [
                        tid
                        for tid in qualified_teacher_ids
                        if (day_value, period) not in teacher_busy[tid]
                        and teacher_load[tid] < teachers[tid].max_periods_per_week
                    ]
                    if not available_teachers:
                        continue
                    # balance total load first; among ties, spread out who gets
                    # this specific period position (first, last, or any
                    # period in between) so no single teacher is stuck
                    # disproportionately with it — a frequent source of staff
                    # friction and objections to the schedule
                    available_teachers.sort(
                        key=lambda tid: (
                            teacher_load[tid],
                            teacher_period_position_count[(tid, period)],
                        )
                    )
                    teacher_id = available_teachers[0]

                    slot = TimetableSlot(
                        classroom_id=classroom.id,
                        day=Weekday(day_value),
                        period_number=period,
                        subject_id=requirement.subject_id,
                        teacher_id=teacher_id,
                    )
                    new_slots.append(slot)
                    classroom_busy[classroom.id].add((day_value, period))
                    teacher_busy[teacher_id].add((day_value, period))
                    teacher_load[teacher_id] += 1
                    teacher_period_position_count[(teacher_id, period)] += 1
                    classroom_subject_count[key] += 1
                    classroom_subject_days[key].add(day_value)
                    classroom_subject_periods[key].add(period)
                    created += 1
                    placed = True
                    break

                if not placed:
                    if key not in warned_subjects:
                        warned_subjects.add(key)
                        subject_name = subjects_map.get(requirement.subject_id, "?")
                        warnings.append(
                            f"تعذّر إكمال جميع حصص {subject_name} في {classroom.name} "
                            "(لا يوجد وقت أو معلم متاح)"
                        )
                    break

    for slot in new_slots:
        session.add(slot)
    session.commit()

    return created, warnings
