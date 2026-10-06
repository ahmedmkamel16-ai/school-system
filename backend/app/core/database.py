from collections.abc import Generator

from sqlmodel import Session, create_engine

from app.core.config import settings
from app.core.db_url import engine_options

engine = create_engine(
    settings.DATABASE_URL,
    **engine_options(
        settings.DATABASE_URL,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE,
        disable_prepared_statements=settings.DB_DISABLE_PREPARED_STATEMENTS,
    ),
)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
