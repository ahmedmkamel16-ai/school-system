"""بيانات اختبارات الواجهة الشاملة (E2E). كلمة مرور الجميع: Passw0rd!"""

from datetime import date, timedelta

from sqlmodel import Session

from app.core.security import hash_password
from app.models.attendance import Attendance, AttendanceStatus
from app.models.classroom import ClassRoom
from app.models.student import Student
from app.models.subject import Subject
from app.models.teacher import Teacher
from app.models.timetable import TimetableSlot, Weekday
from app.models.user import User, UserRole

PASSWORD = "Passw0rd!"


def seed(session: Session) -> None:
    def teacher(name: str, email: str) -> Teacher:
        t = Teacher(full_name=name, email=email, phone="1")
        session.add(t)
        session.flush()
        return t

    def user(email: str, role: UserRole, **kwargs) -> User:
        u = User(email=email, full_name=email.split("@")[0], hashed_password=hash_password(PASSWORD), role=role, **kwargs)
        session.add(u)
        session.flush()
        return u

    t1, t2 = teacher("المعلم أحمد", "t@school.test"), teacher("المعلمة سلمى", "t2@school.test")
    math, arabic = Subject(name="رياضيات"), Subject(name="عربي")
    session.add_all([math, arabic])
    session.flush()

    c1 = ClassRoom(name="السادس أ", grade_level="السادس الابتدائي", academic_year="2025-2026", homeroom_teacher_id=t1.id)
    c2 = ClassRoom(name="السادس ب", grade_level="السادس الابتدائي", academic_year="2025-2026")
    c3 = ClassRoom(name="الخامس أ", grade_level="الخامس الابتدائي", academic_year="2025-2026", homeroom_teacher_id=t2.id)
    session.add_all([c1, c2, c3])
    session.flush()
    for day, period, subject in [(Weekday.SUNDAY, 1, math), (Weekday.SUNDAY, 2, arabic)]:
        session.add(TimetableSlot(classroom_id=c1.id, day=day, period_number=period, subject_id=subject.id, teacher_id=t1.id))
    for day, period, subject in [(Weekday.SUNDAY, 1, arabic), (Weekday.MONDAY, 3, math), (Weekday.THURSDAY, 2, math)]:
        session.add(TimetableSlot(classroom_id=c3.id, day=day, period_number=period, subject_id=subject.id, teacher_id=t2.id))

    user("admin@school.test", UserRole.ADMIN, can_manage_users=True)
    user("acc@school.test", UserRole.ACCOUNTANT)
    user("t@school.test", UserRole.TEACHER, teacher_id=t1.id)
    user("t2@school.test", UserRole.TEACHER, teacher_id=t2.id)
    p1, p2, p3 = user("p1@school.test", UserRole.PARENT), user("p2@school.test", UserRole.PARENT), user("p3@school.test", UserRole.PARENT)

    def student(name: str, national_id: str, classroom: ClassRoom, guardian: User | None) -> Student:
        s = Student(
            full_name=name, national_id=national_id, birth_date=date(2014, 1, 1), grade_level=classroom.grade_level,
            guardian_name=f"ولي {name}", guardian_phone="07700000000", classroom_id=classroom.id,
            guardian_user_id=guardian.id if guardian else None,
        )
        session.add(s)
        session.flush()
        return s

    student("سارة علي", "1", c1, p1)
    student("عمر حسن", "2", c1, p2)
    student("نور محمد", "3", c1, None)
    layth = student("ليث كريم", "4", c3, p3)  # لولي الأمر p3 ابنان في شعبتين مختلفتين
    student("هدى كريم", "5", c2, p3)

    today = date.today()
    pattern = [AttendanceStatus.PRESENT] * 7 + [AttendanceStatus.ABSENT, AttendanceStatus.LATE, AttendanceStatus.PRESENT]
    for offset, status in enumerate(pattern, start=1):  # 10 أيام: 8 حضور فعلي (بما فيها المتأخر)، 1 غياب، 1 تأخر
        session.add(Attendance(student_id=layth.id, attendance_date=today - timedelta(days=offset), status=status))
    session.commit()
