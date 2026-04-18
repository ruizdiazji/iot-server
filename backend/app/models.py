from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class UserResponse(BaseModel):
    username: str
    role: str


class TopicListResponse(BaseModel):
    topics: list[str]


class SeriesPoint(BaseModel):
    ts: str
    value: float


class TimeseriesResponse(BaseModel):
    topic: str
    bucket: str
    points: list[SeriesPoint]


class UserItem(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: str
    updated_at: str


class UserListResponse(BaseModel):
    users: list[UserItem]


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3)
    password: str = Field(min_length=8)
    role: str = Field(default="viewer", pattern="^(admin|viewer)$")


class UpdateUserRequest(BaseModel):
    password: str | None = Field(default=None, min_length=8)
    role: str | None = Field(default=None, pattern="^(admin|viewer)$")
    is_active: bool | None = None
