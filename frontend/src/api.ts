import type {
  CreateUserPayload,
  LoginPayload,
  TimeseriesResponse,
  TopicListResponse,
  TopicSnapshotListResponse,
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

export function getTopicValues() {
  return request<TopicSnapshotListResponse>("/topic-values");
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
