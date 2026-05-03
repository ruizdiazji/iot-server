export interface User {
  username: string;
  role: "admin" | "viewer";
}

export interface TopicListResponse {
  topics: string[];
}

export interface TopicSnapshot {
  topic: string;
  recorded_at: string;
  value: number;
}

export interface TopicSnapshotListResponse {
  topics: TopicSnapshot[];
}

export interface SeriesPoint {
  ts: string;
  value: number;
}

export interface TimeseriesResponse {
  topic: string;
  bucket: string;
  points: SeriesPoint[];
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface UserItem {
  id: number;
  username: string;
  role: "admin" | "viewer";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserListResponse {
  users: UserItem[];
}

export interface CreateUserPayload {
  username: string;
  password: string;
  role: "admin" | "viewer";
}

export interface UpdateUserPayload {
  password?: string;
  role?: "admin" | "viewer";
  is_active?: boolean;
}
