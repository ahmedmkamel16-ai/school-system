from pydantic import BaseModel


class SubjectCreate(BaseModel):
    name: str


class SubjectRead(BaseModel):
    id: int
    name: str
