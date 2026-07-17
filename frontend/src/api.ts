import type {
  CalendarPlan,
  CalendarResponse,
  ConfigHistoryResponse,
  CurrentConfigResponse,
  CreateUserPayload,
  DeviceListResponse,
  DeviceOverviewResponse,
  LoginPayload,
  MetricListResponse,
  MetricTimeseriesResponse,
  ProcessTimeseriesResponse,
  TimeseriesResponse,
  TopicListResponse,
  UpdateUserPayload,
  User,
  UserListResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_PATH ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Request failed");
  }

  return response.json() as Promise<T>;
}

export function login(payload: LoginPayload) {
  return request<User>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  return request<{ ok: boolean }>("/auth/logout", {
    method: "POST",
  });
}

export function getMe() {
  return request<User>("/auth/me");
}

export function getTopics() {
  return request<TopicListResponse>("/topics");
}

export function getTimeseries(params: {
  topic: string;
  from: string;
  to: string;
  bucket: string;
}) {
  const searchParams = new URLSearchParams(params);
  return request<TimeseriesResponse>(`/timeseries?${searchParams.toString()}`);
}

export function getDevices() {
  return request<DeviceListResponse>("/devices");
}

export function getDeviceOverview(groupId: string, edgeNodeId: string) {
  return request<DeviceOverviewResponse>(
    `/devices/${encodeURIComponent(groupId)}/${encodeURIComponent(edgeNodeId)}/overview`,
  );
}

export function getMetrics(groupId: string, edgeNodeId: string) {
  return request<MetricListResponse>(
    `/devices/${encodeURIComponent(groupId)}/${encodeURIComponent(edgeNodeId)}/metrics`,
  );
}

export function getMetricTimeseries(params: {
  group_id: string;
  edge_node_id: string;
  device_id: string;
  metric_name: string;
  from: string;
  to: string;
  bucket: string;
}) {
  const searchParams = new URLSearchParams(params);
  return request<MetricTimeseriesResponse>(`/metrics/timeseries?${searchParams.toString()}`);
}

export function getProcessTimeseries(params: {
  group_id: string;
  edge_node_id: string;
  process: string;
  from: string;
  to: string;
  bucket: string;
}) {
  const searchParams = new URLSearchParams(params);
  return request<ProcessTimeseriesResponse>(`/process-timeseries?${searchParams.toString()}`);
}

export function getCurrentConfig(groupId: string, edgeNodeId: string) {
  return request<CurrentConfigResponse>(
    `/devices/${encodeURIComponent(groupId)}/${encodeURIComponent(edgeNodeId)}/config/current`,
  );
}

export function getConfigHistory(groupId: string, edgeNodeId: string) {
  return request<ConfigHistoryResponse>(
    `/devices/${encodeURIComponent(groupId)}/${encodeURIComponent(edgeNodeId)}/config/history`,
  );
}

export function updateConfig(groupId: string, edgeNodeId: string, payload: { config: Record<string, unknown>; save: boolean }) {
  return request<ConfigHistoryResponse>(
    `/devices/${encodeURIComponent(groupId)}/${encodeURIComponent(edgeNodeId)}/config`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export function getCalendar(groupId: string, edgeNodeId: string) {
  return request<CalendarResponse>(
    `/devices/${encodeURIComponent(groupId)}/${encodeURIComponent(edgeNodeId)}/calendar`,
  );
}

export function updateCalendar(groupId: string, edgeNodeId: string, payload: { calendar: CalendarPlan; save: boolean }) {
  return request<ConfigHistoryResponse>(
    `/devices/${encodeURIComponent(groupId)}/${encodeURIComponent(edgeNodeId)}/calendar`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export function getUsers() {
  return request<UserListResponse>("/users");
}

export function createUser(payload: CreateUserPayload) {
  return request<User>("/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUser(username: string, payload: UpdateUserPayload) {
  return request<User>(`/users/${encodeURIComponent(username)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
