from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.models  # noqa: F401  (تسجيل كل الجداول)
from app.core.database import get_session
from app.core.security import create_access_token
from app.main import app
from app.models.classroom import ClassRoom
from app.models.student import Student
from app.models.subject import Subject
from app.models.teacher import Teacher, TeacherSubject
from app.models.timetable import TimetableSlot, Weekday
from app.models.user import User, UserRole


@pytest.fixture()
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


@pytest.fixture()
def client(session):
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def world(session):
    """مدير، معلمان (A مربّي C1 ولديه حصة رياضيات، B لا علاقة له)، محاسب، وليّا أمر، وطلاب."""

    def user(email, role, **kw):
        u = User(email=email, full_name=email, hashed_password="x", role=role, **kw)
        session.add(u)
        session.flush()
        return u

    ta = Teacher(full_name="A", email="ta@x", phone="1")
    tb = Teacher(full_name="B", email="tb@x", phone="2")
    session.add_all([ta, tb])
    session.flush()

    math, arabic = Subject(name="رياضيات"), Subject(name="عربي")
    session.add_all([math, arabic])
    session.flush()

    c1 = ClassRoom(name="أ", grade_level="الخامس", academic_year="2025-2026", homeroom_teacher_id=ta.id)
    c2 = ClassRoom(name="ب", grade_level="الخامس", academic_year="2025-2026")
    session.add_all([c1, c2])
    session.flush()
    session.add(TimetableSlot(classroom_id=c1.id, day=Weekday.SUNDAY, period_number=1, subject_id=math.id, teacher_id=ta.id))
    session.add(TeacherSubject(teacher_id=ta.id, subject_id=math.id))

    admin = user("admin@x", UserRole.ADMIN)
    teacher_a = user("ta@x", UserRole.TEACHER, teacher_id=ta.id)
    teacher_b = user("tb@x", UserRole.TEACHER, teacher_id=tb.id)
    accountant = user("acc@x", UserRole.ACCOUNTANT)
    p1 = user("p1@x", UserRole.PARENT)
    p2 = user("p2@x", UserRole.PARENT)

    def student(name, nid, classroom, guardian):
        st = Student(
            full_name=name, national_id=nid, birth_date=date(2015, 1, 1), grade_level="الخامس",
            guardian_name="g", guardian_phone="1", classroom_id=classroom.id, guardian_user_id=guardian.id if guardian else None,
        )
        session.add(st)
        session.flush()
        return st

    s1 = student("طالب1", "1", c1, p1)
    s2 = student("طالب2", "2", c1, p2)
    s3 = student("طالب3", "3", c2, None)
    session.commit()

    def headers(u):
        return {"Authorization": f"Bearer {create_access_token(u.email)}"}

    class W:
        pass

    w = W()
    w.__dict__.update(
        admin=headers(admin), ta=headers(teacher_a), tb=headers(teacher_b), acc=headers(accountant),
        p1=headers(p1), p2=headers(p2), users=dict(admin=admin, ta=teacher_a, tb=teacher_b, acc=accountant, p1=p1, p2=p2),
        math=math, arabic=arabic, c1=c1, c2=c2, s1=s1, s2=s2, s3=s3,
    )
    return w
