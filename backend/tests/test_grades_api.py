import uuid

import pytest
from sqlmodel import func, select

from app.models.grades import Exam, ExamResult


def exam_body(w, **over):
    body = dict(
        title="نصفي", exam_type="midterm", term="first", academic_year="2025-2026",
        exam_date="2025-12-01", max_score="50", weight_percent="60",
        subject_id=w.math.id, classroom_id=w.c1.id,
    )
    body.update(over)
    return body


def make_exam(client, w, who="ta", **over):
    r = client.post("/api/v1/exams", json=exam_body(w, **over), headers=getattr(w, who))
    assert r.status_code == 201, r.text
    return r.json()


def bulk(client, w, exam_id, rows, who="ta"):
    return client.post(f"/api/v1/exams/{exam_id}/results/bulk", json={"results": rows}, headers=getattr(w, who))


# ---------------------------------------------------------------- POST /exams


def test_requires_authentication(client, world):
    assert client.post("/api/v1/exams", json=exam_body(world)).status_code == 401


def test_teacher_creates_exam_for_own_class_and_subject(client, world):
    exam = make_exam(client, world)
    assert uuid.UUID(exam["id"]) and exam["status"] == "draft"
    assert exam["created_by"] == world.users["ta"].id


@pytest.mark.parametrize(
    "who, over",
    [
        ("ta", {"subject_id": "arabic"}),  # مادة غير منسوبة له
        ("ta", {"classroom_id": "c2"}),  # فصل غير منسوب له
        ("tb", {}),  # معلم لا علاقة له
        ("acc", {}),  # محاسب
        ("p1", {}),  # ولي أمر
    ],
)
def test_forbidden_roles_and_scopes(client, world, who, over):
    over = {k: getattr(world, v).id for k, v in over.items()}
    r = client.post("/api/v1/exams", json=exam_body(world, **over), headers=getattr(world, who))
    assert r.status_code == 403


def test_admin_can_create_for_any_class(client, world):
    make_exam(client, world, who="admin", subject_id=world.arabic.id, classroom_id=world.c2.id)


def test_teacher_gets_same_403_for_nonexistent_classroom(client, world):
    r = client.post("/api/v1/exams", json=exam_body(world, classroom_id=9999), headers=world.ta)
    assert r.status_code == 403


def test_weight_budget_enforced(client, world):
    make_exam(client, world, title="امتحان1", weight_percent="70")
    r = client.post("/api/v1/exams", json=exam_body(world, title="امتحان2", weight_percent="30.01"), headers=world.ta)
    assert r.status_code == 422 and "100%" in r.json()["detail"]
    make_exam(client, world, title="امتحان2", weight_percent="30")


def test_input_validation_and_mass_assignment(client, world):
    for over in (
        {"created_by": 1}, {"id": str(uuid.uuid4())}, {"status": "locked"},
        {"weight_percent": "101"}, {"weight_percent": "0"}, {"max_score": "0"},
        {"academic_year": "2025-2027"}, {"academic_year": "x"},
    ):
        r = client.post("/api/v1/exams", json=exam_body(world, **over), headers=world.ta)
        assert r.status_code == 422, over


def test_academic_year_is_normalized_and_duplicates_conflict(client, world):
    exam = make_exam(client, world, academic_year="2025/2026")
    assert exam["academic_year"] == "2025-2026"
    r = client.post("/api/v1/exams", json=exam_body(world, weight_percent="10"), headers=world.ta)
    assert r.status_code == 409


# ------------------------------------------------------------- bulk results


def test_bulk_save_update_and_atomic_rejection(client, world, session):
    exam = make_exam(client, world)
    r = bulk(client, world, exam["id"], [
        dict(student_id=world.s1.id, score="40", internal_note="سري"),
        dict(student_id=world.s2.id, status="absent"),
    ])
    assert r.status_code == 200 and len(r.json()) == 2
    # إعادة الإدخال تعدّل ولا تكرّر
    r = bulk(client, world, exam["id"], [dict(student_id=world.s1.id, score="45")])
    assert r.status_code == 200 and r.json()[0]["updated_by"] == world.users["ta"].id
    assert session.exec(select(func.count()).select_from(ExamResult)).one() == 2
    # درجة فوق الحد الأقصى + طالب من فصل آخر ⇒ 422 ولا يُحفظ شيء
    r = bulk(client, world, exam["id"], [
        dict(student_id=world.s1.id, score="10"),
        dict(student_id=world.s2.id, score="50.01"),
        dict(student_id=world.s3.id, score="5"),
    ])
    assert r.status_code == 422 and len(r.json()["detail"]) == 2
    session.expire_all()
    s1_result = session.exec(select(ExamResult).where(ExamResult.student_id == world.s1.id)).one()
    assert s1_result.score == 45
    assert session.exec(select(func.count()).select_from(ExamResult)).one() == 2


def test_bulk_payload_validation(client, world):
    exam = make_exam(client, world)
    bad = [
        [dict(student_id=world.s1.id)],  # graded بلا درجة
        [dict(student_id=world.s1.id, status="absent", score="3")],  # غائب بدرجة
        [dict(student_id=world.s1.id, score="-1")],
        [dict(student_id=world.s1.id, score="1"), dict(student_id=world.s1.id, score="2")],
        [dict(student_id=world.s1.id, score="1", created_by=5)],
    ]
    for rows in bad:
        assert bulk(client, world, exam["id"], rows).status_code == 422, rows
    assert bulk(client, world, "not-a-uuid", [dict(student_id=world.s1.id, score="1")]).status_code == 422


@pytest.mark.parametrize("who", ["tb", "acc", "p1"])
def test_bulk_hidden_from_out_of_scope_users(client, world, who):
    exam = make_exam(client, world)
    assert bulk(client, world, exam["id"], [dict(student_id=world.s1.id, score="1")], who=who).status_code == 404
    assert bulk(client, world, str(uuid.uuid4()), [dict(student_id=world.s1.id, score="1")], who="ta").status_code == 404


def test_status_workflow_and_post_publish_edit_rules(client, world):
    exam = make_exam(client, world)
    path = f"/api/v1/exams/{exam['id']}/status"
    assert client.patch(path, json={"status": "published"}, headers=world.ta).status_code == 403
    assert client.patch(path, json={"status": "locked"}, headers=world.admin).status_code == 409  # قفز مرحلة
    assert client.patch(path, json={"status": "published"}, headers=world.admin).status_code == 200
    row = [dict(student_id=world.s1.id, score="10")]
    assert bulk(client, world, exam["id"], row, who="ta").status_code == 403  # المعلم لا يعدّل بعد النشر
    assert bulk(client, world, exam["id"], row, who="admin").status_code == 200
    assert client.patch(path, json={"status": "locked"}, headers=world.admin).status_code == 200
    assert bulk(client, world, exam["id"], row, who="admin").status_code == 409
    assert client.patch(path, json={"status": "draft"}, headers=world.admin).status_code == 409


# ------------------------------------------------------------- report cards

RC = "/api/v1/students/{}/report-card"
GRC = "/api/v1/guardian/students/{}/report-card"
Q = {"term": "first", "academic_year": "2025-2026"}


def publish_two_exams(client, world):
    e1 = make_exam(client, world, title="نصفي", max_score="50", weight_percent="60")
    e2 = make_exam(client, world, title="نهائي", max_score="100", weight_percent="40")
    bulk(client, world, e1["id"], [dict(student_id=world.s1.id, score="40", teacher_note="جيد", internal_note="سري جدًا")])
    bulk(client, world, e2["id"], [dict(student_id=world.s1.id, score="50")])
    for e in (e1, e2):
        client.patch(f"/api/v1/exams/{e['id']}/status", json={"status": "published"}, headers=world.admin)


def test_report_card_math_and_draft_lifecycle(client, world):
    publish_two_exams(client, world)
    r = client.get(RC.format(world.s1.id), params=Q, headers=world.ta)
    assert r.status_code == 200, r.text
    card = r.json()
    # 60×(40/50) + 40×(50/100) = 48 + 20 = 68%
    assert card["overall_percentage"] == "68.00"
    assert card["entries"][0]["weighted_percentage"] == "68.00"
    assert card["entries"][0]["subject_name"] == "رياضيات"
    assert card["status"] == "draft"
    assert card["overall_result"] == "passed"


def test_missing_result_makes_card_incomplete_and_excused_is_ignored(client, world):
    e1 = make_exam(client, world, title="امتحان1", max_score="10", weight_percent="50")
    e2 = make_exam(client, world, title="امتحان2", max_score="10", weight_percent="50")
    for e in (e1, e2):
        client.patch(f"/api/v1/exams/{e['id']}/status", json={"status": "published"}, headers=world.admin)
    bulk(client, world, e1["id"], [dict(student_id=world.s1.id, score="10")], who="admin")
    r = client.get(RC.format(world.s1.id), params=Q, headers=world.admin).json()
    assert r["overall_result"] == "incomplete" and r["overall_percentage"] == "100.00"
    bulk(client, world, e2["id"], [dict(student_id=world.s1.id, status="excused")], who="admin")
    r = client.get(RC.format(world.s1.id), params=Q, headers=world.admin).json()
    assert r["overall_result"] == "passed" and r["overall_percentage"] == "100.00"
    bulk(client, world, e2["id"], [dict(student_id=world.s1.id, status="absent")], who="admin")
    r = client.get(RC.format(world.s1.id), params=Q, headers=world.admin).json()
    assert r["overall_percentage"] == "50.00"  # غياب = صفر


def test_staff_access_scope(client, world):
    publish_two_exams(client, world)
    url = RC.format(world.s1.id)
    assert client.get(url, params=Q, headers=world.admin).status_code == 200
    assert client.get(url, params=Q, headers=world.ta).status_code == 200
    assert client.get(url, params=Q, headers=world.acc).status_code == 200
    assert client.get(url, params=Q, headers=world.tb).status_code == 404  # ليس مربّي فصله
    assert client.get(RC.format(world.s3.id), params=Q, headers=world.ta).status_code == 404
    assert client.get(url, params=Q, headers=world.p1).status_code == 403  # ولي الأمر له مساره
    assert client.get(url, params=Q).status_code == 401
    assert client.get(url, params={"term": "first", "academic_year": "bad"}, headers=world.ta).status_code == 422


def test_guardian_sees_only_published_own_children_without_sensitive_fields(client, world):
    publish_two_exams(client, world)
    url = GRC.format(world.s1.id)
    assert client.get(url, params=Q, headers=world.p1).status_code == 404  # لم يُنشر بعد
    client.get(RC.format(world.s1.id), params=Q, headers=world.ta)  # مسودة موجودة، ما زالت مخفية
    assert client.get(url, params=Q, headers=world.p1).status_code == 404

    assert client.post(RC.format(world.s1.id) + "/publish", params=Q, headers=world.ta).status_code == 403
    assert client.post(RC.format(world.s1.id) + "/publish", params=Q, headers=world.admin).status_code == 200

    r = client.get(url, params=Q, headers=world.p1)
    assert r.status_code == 200
    body = r.json()
    assert body["overall_percentage"] == "68.00" and body["student_name"] == "طالب1"
    assert set(body) == {"id", "student_name", "classroom_name", "term", "academic_year", "overall_percentage", "overall_result", "published_at", "entries"}
    assert "سري" not in r.text and "created_by" not in r.text and "internal_note" not in r.text
    # ولي أمر آخر، طالب غير مربوط، معلم، مدير ⇒ لا وصول
    assert client.get(url, params=Q, headers=world.p2).status_code == 404
    assert client.get(GRC.format(world.s3.id), params=Q, headers=world.p1).status_code == 404
    assert client.get(url, params=Q, headers=world.ta).status_code == 403
    assert client.get(url, params=Q, headers=world.admin).status_code == 403
    assert client.get(url, params=Q).status_code == 401


def test_published_card_is_a_stable_snapshot_until_republished(client, world, session):
    publish_two_exams(client, world)
    pub = RC.format(world.s1.id) + "/publish"
    assert client.post(pub, params=Q, headers=world.admin).json()["overall_percentage"] == "68.00"

    # المدير يصحّح درجة بعد النشر: الكشف المنشور لا يتغير تلقائيًا
    midterm = session.exec(select(Exam).where(Exam.title == "نصفي")).one()
    row = [dict(student_id=world.s1.id, score="50")]
    assert bulk(client, world, midterm.id, row, who="admin").status_code == 200
    assert client.get(RC.format(world.s1.id), params=Q, headers=world.admin).json()["overall_percentage"] == "68.00"
    assert client.get(GRC.format(world.s1.id), params=Q, headers=world.p1).json()["overall_percentage"] == "68.00"
    # إعادة النشر تحدّث اللقطة: 60 + 20 = 80
    assert client.post(pub, params=Q, headers=world.admin).json()["overall_percentage"] == "80.00"
    assert client.get(GRC.format(world.s1.id), params=Q, headers=world.p1).json()["overall_percentage"] == "80.00"


# ------------------------------------------------- GET /exams, /exams/{id}


def test_list_exams_scoped_by_role_and_filtered(client, world):
    e1 = make_exam(client, world, title="امتحان1", weight_percent="30")
    make_exam(client, world, title="امتحان2", weight_percent="30", term="second")
    make_exam(client, world, who="admin", subject_id=world.arabic.id, classroom_id=world.c2.id)
    client.patch(f"/api/v1/exams/{e1['id']}/status", json={"status": "published"}, headers=world.admin)

    assert len(client.get("/api/v1/exams", headers=world.admin).json()) == 3
    mine = client.get("/api/v1/exams", headers=world.ta).json()
    assert len(mine) == 2 and {e["subject_name"] for e in mine} == {"رياضيات"}
    assert client.get("/api/v1/exams", headers=world.tb).json() == []
    for who in ("acc", "p1"):
        assert client.get("/api/v1/exams", headers=getattr(world, who)).status_code == 403
    assert client.get("/api/v1/exams").status_code == 401

    def count(**params):
        return len(client.get("/api/v1/exams", params=params, headers=world.admin).json())

    assert count(class_id=world.c2.id) == 1
    assert count(subject_id=world.math.id) == 2
    assert count(status="published") == 1 and count(status="draft") == 2
    assert count(term="second") == 1
    assert count(academic_year="2025/2026") == 3
    assert client.get("/api/v1/exams", params={"status": "bogus"}, headers=world.admin).status_code == 422
    # teacher filter cannot widen scope
    assert client.get("/api/v1/exams", params={"class_id": world.c2.id}, headers=world.ta).json() == []
    item = mine[0]
    assert item["classroom_name"] == "أ" and item["students_count"] == 2 and item["graded_count"] == 0


def test_exam_detail_returns_gradebook_rows_with_scope(client, world):
    exam = make_exam(client, world)
    bulk(client, world, exam["id"], [dict(student_id=world.s1.id, score="42.5", teacher_note="ممتاز", internal_note="خاص")])
    r = client.get(f"/api/v1/exams/{exam['id']}", headers=world.ta)
    assert r.status_code == 200
    body = r.json()
    assert body["graded_count"] == 1 and body["students_count"] == 2
    rows = {row["student_id"]: row for row in body["rows"]}
    assert set(rows) == {world.s1.id, world.s2.id}  # طلاب فصل الامتحان فقط
    assert rows[world.s1.id]["score"] == "42.50" and rows[world.s1.id]["internal_note"] == "خاص"
    assert rows[world.s2.id]["status"] is None and rows[world.s2.id]["result_id"] is None
    assert client.get(f"/api/v1/exams/{exam['id']}", headers=world.admin).status_code == 200
    for who in ("tb", "acc", "p1"):
        assert client.get(f"/api/v1/exams/{exam['id']}", headers=getattr(world, who)).status_code == 404
    assert client.get(f"/api/v1/exams/{uuid.uuid4()}", headers=world.admin).status_code == 404
    assert client.get("/api/v1/exams/not-a-uuid", headers=world.admin).status_code == 422


def test_assignments_follow_teacher_scope(client, world):
    mine = client.get("/api/v1/exams/assignments", headers=world.ta).json()
    assert [(a["classroom_id"], a["subject_id"]) for a in mine] == [(world.c1.id, world.math.id)]
    assert client.get("/api/v1/exams/assignments", headers=world.tb).json() == []
    assert len(client.get("/api/v1/exams/assignments", headers=world.admin).json()) == 4
    assert client.get("/api/v1/exams/assignments", headers=world.p1).status_code == 403


def test_report_card_notes_are_teacher_notes_only(client, world):
    publish_two_exams(client, world)
    client.post(RC.format(world.s1.id) + "/publish", params=Q, headers=world.admin)
    body = client.get(GRC.format(world.s1.id), params=Q, headers=world.p1).json()
    assert body["classroom_name"] == "أ"
    assert body["entries"][0]["notes"] == ["نصفي: جيد"]
    assert "سري" not in str(body)
