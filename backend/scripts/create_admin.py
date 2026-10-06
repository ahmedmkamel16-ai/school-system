"""إنشاء المدير الأول (أو مدير إضافي) من سطر الأوامر، دون فتح مسار تسجيل عام.

    docker compose exec backend python scripts/create_admin.py --email admin@school.iq --name "مدير النظام"

كلمة المرور تُطلب تفاعليًا (لا تُمرَّر كوسيط حتى لا تبقى في سجل الأوامر).
"""

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.database import engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402

MIN_PASSWORD_LENGTH = 12


def main() -> int:
    parser = argparse.ArgumentParser(description="إنشاء حساب مدير")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()

    password = getpass.getpass("كلمة المرور: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"كلمة المرور أقصر من {MIN_PASSWORD_LENGTH} حرفًا", file=sys.stderr)
        return 1
    if password != getpass.getpass("أعد كتابتها: "):
        print("كلمتا المرور غير متطابقتين", file=sys.stderr)
        return 1

    with Session(engine) as session:
        if session.exec(select(User).where(User.email == args.email)).first():
            print("البريد مستخدم بالفعل", file=sys.stderr)
            return 1
        session.add(
            User(
                email=args.email,
                full_name=args.name,
                hashed_password=hash_password(password),
                role=UserRole.ADMIN,
                can_manage_users=True,
            )
        )
        session.commit()
    print(f"تم إنشاء المدير {args.email}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
