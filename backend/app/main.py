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
    CalendarResponse,
    CalendarUpdateRequest,
    ConfigHistoryResponse,
    ConfigUpdateRequest,
    CreateUserRequest,
    CurrentConfigResponse,
    DeviceListResponse,
    DeviceOverviewResponse,
    LoginRequest,
    LatestStatusResponse,
    MetricListResponse,
    MetricTimeseriesResponse,
    ProcessTimeseriesResponse,
    TimeseriesResponse,
    TopicListResponse,
    UpdateUserRequest,
    UserListResponse,
    UserResponse,
)
from app.queries import (
    ALLOWED_BUCKETS,
    ensure_observability_tables,
    get_current_config,
    get_current_calendar,
    get_latest_status,
    get_metric_timeseries,
    get_overview,
    get_process_timeseries,
    get_timeseries,
    list_config_history,
    list_devices,
    list_metrics,
    list_topics,
    publish_calendar_update,
    publish_config_update,
)
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
    ensure_observability_tables()
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


@app.get("/devices", response_model=DeviceListResponse)
def devices(_: CurrentUser):
    return DeviceListResponse(devices=list_devices())


@app.get("/devices/{group_id}/{edge_node_id}/metrics", response_model=MetricListResponse)
def metrics(group_id: str, edge_node_id: str, _: CurrentUser):
    return MetricListResponse(metrics=list_metrics(group_id, edge_node_id))


@app.get("/devices/{group_id}/{edge_node_id}/overview", response_model=DeviceOverviewResponse)
def overview(group_id: str, edge_node_id: str, _: CurrentUser):
    return DeviceOverviewResponse(**get_overview(group_id, edge_node_id))


@app.get("/devices/{group_id}/{edge_node_id}/status/latest", response_model=LatestStatusResponse)
def latest_status(group_id: str, edge_node_id: str, _: CurrentUser):
    return LatestStatusResponse(**get_latest_status(group_id, edge_node_id))


@app.get("/metrics/timeseries", response_model=MetricTimeseriesResponse)
def metric_timeseries(
    _: CurrentUser,
    group_id: str = Query(min_length=1),
    edge_node_id: str = Query(min_length=1),
    device_id: str = Query(min_length=1),
    metric_name: str = Query(min_length=1),
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

    points = get_metric_timeseries(
        group_id,
        edge_node_id,
        device_id,
        metric_name,
        from_ts,
        to_ts,
        bucket,
    )
    return MetricTimeseriesResponse(
        group_id=group_id,
        edge_node_id=edge_node_id,
        device_id=device_id,
        metric_name=metric_name,
        bucket=bucket,
        points=points,
    )


@app.get("/process-timeseries", response_model=ProcessTimeseriesResponse)
def process_timeseries(
    _: CurrentUser,
    group_id: str = Query(min_length=1),
    edge_node_id: str = Query(min_length=1),
    process: str = Query(default="temperature", pattern="^(temperature|humidity|co2|light|energy)$"),
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

    series = get_process_timeseries(
        group_id,
        edge_node_id,
        process,
        from_ts,
        to_ts,
        bucket,
    )
    return ProcessTimeseriesResponse(
        group_id=group_id,
        edge_node_id=edge_node_id,
        process=process,
        bucket=bucket,
        series=series,
    )


@app.get("/devices/{group_id}/{edge_node_id}/config/current", response_model=CurrentConfigResponse)
def current_config(group_id: str, edge_node_id: str, _: CurrentUser):
    return CurrentConfigResponse(**get_current_config(group_id, edge_node_id))


@app.get("/devices/{group_id}/{edge_node_id}/config/history", response_model=ConfigHistoryResponse)
def config_history(group_id: str, edge_node_id: str, _: CurrentUser):
    return ConfigHistoryResponse(revisions=list_config_history(group_id, edge_node_id))


@app.patch("/devices/{group_id}/{edge_node_id}/config", response_model=ConfigHistoryResponse)
def patch_config(
    group_id: str,
    edge_node_id: str,
    payload: ConfigUpdateRequest,
    current_user: CurrentAdmin,
):
    revision = publish_config_update(
        group_id=group_id,
        edge_node_id=edge_node_id,
        device_id="control",
        config=payload.config,
        save=payload.save,
        changed_by=current_user["username"],
    )
    return ConfigHistoryResponse(revisions=[revision])


@app.get("/devices/{group_id}/{edge_node_id}/calendar", response_model=CalendarResponse)
def current_calendar(group_id: str, edge_node_id: str, _: CurrentUser):
    return CalendarResponse(**get_current_calendar(group_id, edge_node_id))


@app.patch("/devices/{group_id}/{edge_node_id}/calendar", response_model=ConfigHistoryResponse)
def patch_calendar(
    group_id: str,
    edge_node_id: str,
    payload: CalendarUpdateRequest,
    current_user: CurrentAdmin,
):
    revision = publish_calendar_update(
        group_id=group_id,
        edge_node_id=edge_node_id,
        device_id="control",
        calendar=payload.calendar.model_dump(),
        save=payload.save,
        changed_by=current_user["username"],
    )
    return ConfigHistoryResponse(revisions=[revision])


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
