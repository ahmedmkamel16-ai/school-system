from collections.abc import Generator

from sqlmodel import Session, create_engine

from app.core.config import settings

connect_args = (
    {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
)
# pool_pre_ping: يتجاوز الاتصالات الميتة بعد إعادة تشغيل قاعدة البيانات
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
