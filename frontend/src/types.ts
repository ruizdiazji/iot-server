export interface User {
  username: string;
  role: "admin" | "viewer";
}

export interface TopicListResponse {
  topics: string[];
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

export interface DeviceItem {
  group_id: string;
  edge_node_id: string;
  device_id: string;
  display_name?: string | null;
  command_topic?: string | null;
  is_online: boolean;
  last_seen_at?: string | null;
}

export interface DeviceListResponse {
  devices: DeviceItem[];
}

export interface MetricItem {
  device_id: string;
  metric_name: string;
  unit?: string | null;
  source_model?: string | null;
  source_channel?: string | null;
  last_value?: number | string | null;
  last_recorded_at?: string | null;
}

export interface MetricListResponse {
  metrics: MetricItem[];
}

export interface MetricTimeseriesResponse {
  group_id: string;
  edge_node_id: string;
  device_id: string;
  metric_name: string;
  bucket: string;
  points: SeriesPoint[];
}

export interface ChartSeries {
  key: string;
  label: string;
  unit?: string | null;
  points: SeriesPoint[];
}

export interface ProcessTimeseriesResponse {
  group_id: string;
  edge_node_id: string;
  process: string;
  bucket: string;
  series: ChartSeries[];
}

export interface OverviewMetric {
  device_id?: string | null;
  metric_name: string;
  value: number | string | null;
  unit?: string | null;
  source_model?: string | null;
  source_channel?: string | null;
  recorded_at?: string | null;
}

export interface DeviceOverviewResponse {
  group_id: string;
  edge_node_id: string;
  environment: OverviewMetric[];
  status?: Record<string, unknown> | null;
}

export interface CurrentConfigResponse {
  group_id: string;
  edge_node_id: string;
  device_id: string;
  config?: Record<string, unknown> | null;
  source?: string | null;
  updated_at?: string | null;
  confirmed_at?: string | null;
}

export interface ConfigRevisionItem {
  id: number;
  group_id: string;
  edge_node_id: string;
  device_id: string;
  config: Record<string, unknown>;
  changed_by?: string | null;
  status: "pending" | "sent" | "confirmed" | "rejected" | "failed";
  command_topic?: string | null;
  error?: string | null;
  requested_at: string;
  confirmed_at?: string | null;
}

export interface ConfigHistoryResponse {
  revisions: ConfigRevisionItem[];
}

export interface CalendarStage {
  key: string;
  label: string;
  start_day: number;
  end_day: number;
  setpoints: Record<string, number | string | boolean>;
}

export interface CalendarPlan {
  species: "girgolas";
  start_date: string;
  end_date: string;
  stages: CalendarStage[];
}

export interface CalendarResponse {
  group_id: string;
  edge_node_id: string;
  device_id: string;
  calendar?: CalendarPlan | null;
  source?: string | null;
  updated_at?: string | null;
  revision_id?: number | null;
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
