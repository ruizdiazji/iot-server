from typing import Any

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


class DeviceItem(BaseModel):
    group_id: str
    edge_node_id: str
    device_id: str
    display_name: str | None = None
    command_topic: str | None = None
    is_online: bool
    last_seen_at: str | None = None


class DeviceListResponse(BaseModel):
    devices: list[DeviceItem]


class MetricItem(BaseModel):
    device_id: str
    metric_name: str
    unit: str | None = None
    source_model: str | None = None
    source_channel: str | None = None
    last_value: float | str | None = None
    last_recorded_at: str | None = None


class MetricListResponse(BaseModel):
    metrics: list[MetricItem]


class MetricTimeseriesResponse(BaseModel):
    group_id: str
    edge_node_id: str
    device_id: str
    metric_name: str
    bucket: str
    points: list[SeriesPoint]


class ChartSeries(BaseModel):
    key: str
    label: str
    unit: str | None = None
    points: list[SeriesPoint]


class ProcessTimeseriesResponse(BaseModel):
    group_id: str
    edge_node_id: str
    process: str
    bucket: str
    series: list[ChartSeries]


class LatestStatusResponse(BaseModel):
    group_id: str
    edge_node_id: str
    device_id: str
    recorded_at: str | None = None
    payload: dict[str, Any] | None = None


class OverviewMetric(BaseModel):
    device_id: str | None = None
    metric_name: str
    value: float | str | None
    unit: str | None = None
    source_model: str | None = None
    source_channel: str | None = None
    recorded_at: str | None = None


class DeviceOverviewResponse(BaseModel):
    group_id: str
    edge_node_id: str
    environment: list[OverviewMetric]
    status: dict[str, Any] | None = None


class CurrentConfigResponse(BaseModel):
    group_id: str
    edge_node_id: str
    device_id: str
    config: dict[str, Any] | None = None
    source: str | None = None
    updated_at: str | None = None
    confirmed_at: str | None = None


class ConfigRevisionItem(BaseModel):
    id: int
    group_id: str
    edge_node_id: str
    device_id: str
    config: dict[str, Any]
    changed_by: str | None = None
    status: str
    command_topic: str | None = None
    error: str | None = None
    requested_at: str
    confirmed_at: str | None = None


class ConfigHistoryResponse(BaseModel):
    revisions: list[ConfigRevisionItem]


class ConfigUpdateRequest(BaseModel):
    config: dict[str, Any]
    save: bool = True


class CalendarStage(BaseModel):
    key: str
    label: str
    start_day: int = Field(ge=0)
    end_day: int = Field(ge=0)
    setpoints: dict[str, Any]


class CalendarPlan(BaseModel):
    species: str = Field(default="girgolas", pattern="^girgolas$")
    start_date: str
    end_date: str
    stages: list[CalendarStage]


class CalendarResponse(BaseModel):
    group_id: str
    edge_node_id: str
    device_id: str
    calendar: CalendarPlan | None = None
    source: str | None = None
    updated_at: str | None = None
    revision_id: int | None = None


class CalendarUpdateRequest(BaseModel):
    calendar: CalendarPlan
    save: bool = True


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
