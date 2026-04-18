from datetime import datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from psycopg.errors import UniqueViolation

from app.auth import (
    clear_auth_cookie,
    create_access_token,
    require_admin,
    require_user,
    set_auth_cookie,
)
from app.models import (
    CreateUserRequest,
    LoginRequest,
    TimeseriesResponse,
    TopicListResponse,
    UpdateUserRequest,
    UserListResponse,
    UserResponse,
)
from app.queries import ALLOWED_BUCKETS, get_timeseries, list_topics
from app.users import (
    authenticate_user,
    create_user,
    ensure_admin_user,
    list_users,
    update_user,
)

app = FastAPI(title="MQTT Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


CurrentUser = Annotated[dict[str, str], Depends(require_user)]
CurrentAdmin = Annotated[dict[str, str], Depends(require_admin)]


@app.on_event("startup")
def startup() -> None:
    ensure_admin_user()


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.post("/auth/login", response_model=UserResponse)
def login(payload: LoginRequest, response: Response):
    user = authenticate_user(payload.username, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_access_token(user.username, user.role)
    set_auth_cookie(response, token)
    return UserResponse(username=user.username, role=user.role)


@app.post("/auth/logout")
def logout(response: Response, _: CurrentUser):
    clear_auth_cookie(response)
    return {"ok": True}


@app.get("/auth/me", response_model=UserResponse)
def me(current_user: CurrentUser):
    return UserResponse(
        username=current_user["username"],
        role=current_user["role"],
    )


@app.get("/topics", response_model=TopicListResponse)
def topics(_: CurrentUser):
    return TopicListResponse(topics=list_topics())


@app.get("/timeseries", response_model=TimeseriesResponse)
def timeseries(
    _: CurrentUser,
    topic: str = Query(min_length=1),
    from_ts: datetime = Query(alias="from"),
    to_ts: datetime = Query(alias="to"),
    bucket: str = Query(default="1 minute"),
):
    if from_ts >= to_ts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'from' must be earlier than 'to'",
        )

    if bucket not in ALLOWED_BUCKETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported bucket. Allowed values: {', '.join(sorted(ALLOWED_BUCKETS))}",
        )

    points = get_timeseries(topic, from_ts, to_ts, bucket)
    return TimeseriesResponse(topic=topic, bucket=bucket, points=points)


@app.get("/users", response_model=UserListResponse)
def get_users(_: CurrentAdmin):
    return UserListResponse(users=list_users())


@app.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def post_user(payload: CreateUserRequest, _: CurrentAdmin):
    try:
        created = create_user(
            username=payload.username,
            password=payload.password,
            role=payload.role,
        )
    except UniqueViolation as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        ) from exc

    return UserResponse(username=created["username"], role=created["role"])


@app.patch("/users/{username}", response_model=UserResponse)
def patch_user(username: str, payload: UpdateUserRequest, _: CurrentAdmin):
    updated = update_user(
        username,
        password=payload.password,
        role=payload.role,
        is_active=payload.is_active,
    )
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return UserResponse(username=updated["username"], role=updated["role"])
