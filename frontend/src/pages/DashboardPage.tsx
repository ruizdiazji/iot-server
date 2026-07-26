import { useEffect, useMemo, useRef, useState } from "react";

import {
  getCalendar,
  getConfigHistory,
  getCurrentConfig,
  getDeviceOverview,
  getDevices,
  getProcessTimeseries,
  logout,
  updateCalendar,
  updateConfig,
} from "../api";
import { GaugeMetricCard } from "../components/GaugeMetricCard";
import { LinearGaugeCard } from "../components/LinearGaugeCard";
import { TimeseriesChart } from "../components/TimeseriesChart";
import { UserManagementPanel } from "../components/UserManagementPanel";
import type {
  CalendarPlan,
  CalendarStage,
  ConfigRevisionItem,
  CurrentConfigResponse,
  DeviceItem,
  DeviceOverviewResponse,
  ChartSeries,
  User,
} from "../types";

const RANGE_OPTIONS = [
  { label: "1h", hours: 1, bucket: "1 minute" },
  { label: "24h", hours: 24, bucket: "5 minutes" },
  { label: "7d", hours: 24 * 7, bucket: "1 hour" },
];

const BUCKET_OPTIONS = [
  "1 second",
  "10 seconds",
  "30 seconds",
  "1 minute",
  "5 minutes",
  "15 minutes",
  "1 hour",
];

const DEFAULT_CONFIG = {
  mode: "auto",
  temperature_setpoint_c: 25,
  humidity_setpoint_pct: 60,
  co2_setpoint_ppm: 900,
  light_setpoint_lux: 0,
  air_circulation_setpoint_pct: 0,
};

const PROCESS_OPTIONS = [
  { key: "temperature", label: "Temperatura" },
  { key: "humidity", label: "Humedad" },
  { key: "co2", label: "CO2" },
  { key: "light", label: "Luz" },
  { key: "energy", label: "Energia" },
];

type ActiveTab = "status" | "system" | "history" | "calendar" | "video" | "config" | "users";

const SETPOINT_FIELDS = [
  { key: "temperature_c", label: "Temperatura", unit: "C" },
  { key: "humidity_pct", label: "Humedad", unit: "%" },
  { key: "co2_ppm", label: "CO2", unit: "ppm" },
  { key: "light_lux", label: "Luz", unit: "lux" },
  { key: "air_circulation_pct", label: "Circulacion", unit: "%" },
];

interface DashboardPageProps {
  user: User;
  onLoggedOut: () => void;
}

function toIsoDate(hoursBack: number) {
  return new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`).getTime();
  const endDate = new Date(`${end}T00:00:00`).getTime();
  return Math.max(0, Math.round((endDate - startDate) / 86400000));
}

function buildGirgolasCalendar(startDate = addDays(todayDate(), -18)): CalendarPlan {
  return {
    species: "girgolas",
    start_date: startDate,
    end_date: addDays(startDate, 35),
    stages: [
      {
        key: "inoculacion",
        label: "Inoculacion",
        start_day: 0,
        end_day: 2,
        setpoints: { temperature_c: 24, humidity_pct: 75, co2_ppm: 900, light_lux: 0, air_circulation_pct: 10 },
      },
      {
        key: "colonizacion",
        label: "Colonizacion",
        start_day: 3,
        end_day: 17,
        setpoints: { temperature_c: 24, humidity_pct: 85, co2_ppm: 1500, light_lux: 0, air_circulation_pct: 15 },
      },
      {
        key: "floracion",
        label: "Floracion",
        start_day: 18,
        end_day: 30,
        setpoints: { temperature_c: 18, humidity_pct: 92, co2_ppm: 800, light_lux: 500, air_circulation_pct: 35 },
      },
      {
        key: "cosecha",
        label: "Cosecha",
        start_day: 31,
        end_day: 35,
        setpoints: { temperature_c: 18, humidity_pct: 88, co2_ppm: 800, light_lux: 400, air_circulation_pct: 30 },
      },
    ],
  };
}

function isLockedStage(stageKey: string) {
  return stageKey === "inoculacion" || stageKey === "colonizacion";
}

function stageStartDate(calendar: CalendarPlan, stage: CalendarStage) {
  return addDays(calendar.start_date, stage.start_day);
}

function stageEndDate(calendar: CalendarPlan, stage: CalendarStage) {
  return addDays(calendar.start_date, stage.end_day);
}

function dayOffsetFromDate(calendar: CalendarPlan, date: string) {
  return daysBetween(calendar.start_date, date);
}

function nodeKey(device: Pick<DeviceItem, "group_id" | "edge_node_id">) {
  return `${device.group_id}::${device.edge_node_id}`;
}

function uniqueNodes(devices: DeviceItem[]) {
  const seen = new Set<string>();
  return devices.filter((device) => {
    const key = nodeKey(device);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function statusText(status: Record<string, unknown> | null | undefined, key: string) {
  const value = status?.[key];
  if (value === true) return "Si";
  if (value === false) return "No";
  if (value === null || value === undefined) return "-";
  return String(value);
}

function prettyMetricName(metricName: string) {
  const labels: Record<string, string> = {
    temperature_c: "Temperatura",
    humidity_pct: "Humedad",
    co2_ppm: "CO2",
    light_lux: "Luz",
    power_w: "Potencia",
    energy_wh: "Energia",
    energy_kwh: "Energia",
    voltage_v: "Tension",
    current_a: "Corriente",
    power_factor: "Factor de potencia",
  };
  return labels[metricName] ?? metricName.replace(/_/g, " ");
}

function configToText(config: CurrentConfigResponse | null) {
  return JSON.stringify(config?.config ?? DEFAULT_CONFIG, null, 2);
}

async function waitForIceGathering(peerConnection: RTCPeerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 3000);
    const handleStateChange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        window.clearTimeout(timeout);
        peerConnection.removeEventListener("icegatheringstatechange", handleStateChange);
        resolve();
      }
    };
    peerConnection.addEventListener("icegatheringstatechange", handleStateChange);
  });
}

export function DashboardPage({ user, onLoggedOut }: DashboardPageProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("status");
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [selectedNodeKey, setSelectedNodeKey] = useState("");
  const [overview, setOverview] = useState<DeviceOverviewResponse | null>(null);
  const [selectedProcess, setSelectedProcess] = useState("temperature");
  const [from, setFrom] = useState(toIsoDate(1));
  const [to, setTo] = useState(new Date().toISOString());
  const [bucket, setBucket] = useState("1 minute");
  const [processSeries, setProcessSeries] = useState<ChartSeries[]>([]);
  const [currentConfig, setCurrentConfig] = useState<CurrentConfigResponse | null>(null);
  const [configText, setConfigText] = useState(configToText(null));
  const [configEdited, setConfigEdited] = useState(false);
  const [configHistory, setConfigHistory] = useState<ConfigRevisionItem[]>([]);
  const [calendarPlan, setCalendarPlan] = useState<CalendarPlan | null>(null);
  const [calendarDraft, setCalendarDraft] = useState<CalendarPlan>(buildGirgolasCalendar());
  const [calendarEditing, setCalendarEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const savedTheme = window.localStorage.getItem("dashboard_theme");
    return savedTheme === "dark" ? "dark" : "light";
  });
  const [webrtcUrl, setWebrtcUrl] = useState(() => window.localStorage.getItem("webrtc_whep_url") ?? "");
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoStatus, setVideoStatus] = useState("Detenido");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const nodes = useMemo(() => uniqueNodes(devices), [devices]);
  const selectedNode = nodes.find((device) => nodeKey(device) === selectedNodeKey) ?? nodes[0];
  const environmentMetrics = useMemo(
    () => overview?.environment.filter((metric) => (metric.device_id ?? "environment") === "environment") ?? [],
    [overview?.environment],
  );
  const energyMetrics = useMemo(
    () => overview?.environment.filter((metric) => metric.device_id === "energy") ?? [],
    [overview?.environment],
  );
  const appliedOutputs = useMemo(
    () => Object.entries((overview?.status?.applied as Record<string, unknown> | undefined) ?? {}),
    [overview?.status],
  );
  const calendarTimeline = useMemo(() => {
    if (!calendarPlan) return null;
    const totalDays = Math.max(1, daysBetween(calendarPlan.start_date, calendarPlan.end_date));
    const elapsedDays = Math.max(0, Math.min(totalDays, daysBetween(calendarPlan.start_date, todayDate())));
    return { totalDays, elapsedDays, progress: (elapsedDays / totalDays) * 100 };
  }, [calendarPlan]);

  useEffect(() => {
    document.body.classList.toggle("theme-dark", theme === "dark");
    window.localStorage.setItem("dashboard_theme", theme);
    return () => {
      document.body.classList.remove("theme-dark");
    };
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle("mobile-nav-open", mobileMenuOpen);
    return () => document.body.classList.remove("mobile-nav-open");
  }, [mobileMenuOpen]);

  useEffect(() => {
    let active = true;

    async function loadDevices() {
      try {
        const response = await getDevices();
        if (!active) return;
        setDevices(response.devices);
        const firstNode = uniqueNodes(response.devices)[0];
        if (firstNode) {
          setSelectedNodeKey(nodeKey(firstNode));
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los dispositivos");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDevices();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    let active = true;

    async function loadNodeData() {
      setError(null);
      try {
        const [overviewResponse, configResponse, historyResponse, calendarResponse] = await Promise.all([
          getDeviceOverview(selectedNode.group_id, selectedNode.edge_node_id),
          getCurrentConfig(selectedNode.group_id, selectedNode.edge_node_id),
          getConfigHistory(selectedNode.group_id, selectedNode.edge_node_id),
          getCalendar(selectedNode.group_id, selectedNode.edge_node_id),
        ]);
        if (!active) return;
        setOverview(overviewResponse);
        setCurrentConfig(configResponse);
        setConfigText((current) => (configEdited ? current : configToText(configResponse)));
        setConfigHistory(historyResponse.revisions);
        setCalendarPlan(calendarResponse.calendar ?? null);
        if (!calendarEditing) {
          setCalendarDraft(calendarResponse.calendar ?? buildGirgolasCalendar());
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el nodo");
        }
      }
    }

    void loadNodeData();
    const interval = window.setInterval(() => void loadNodeData(), 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [calendarEditing, configEdited, selectedNode?.edge_node_id, selectedNode?.group_id]);

  useEffect(() => {
    if (!selectedNode) {
      setProcessSeries([]);
      return;
    }

    let active = true;

    async function loadSeries() {
      setQuerying(true);
      setError(null);
      try {
        const response = await getProcessTimeseries({
          group_id: selectedNode.group_id,
          edge_node_id: selectedNode.edge_node_id,
          process: selectedProcess,
          from,
          to,
          bucket,
        });
        if (active) {
          setProcessSeries(response.series);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la serie temporal");
        }
      } finally {
        if (active) {
          setQuerying(false);
        }
      }
    }

    void loadSeries();
    return () => {
      active = false;
    };
  }, [bucket, from, selectedNode?.edge_node_id, selectedNode?.group_id, selectedProcess, to]);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  async function playVideo() {
    const endpoint = webrtcUrl.trim();
    if (!endpoint) {
      setError("Indica la URL WHEP del stream WebRTC");
      return;
    }

    stopVideo();
    setError(null);
    setVideoStatus("Conectando...");

    try {
      window.localStorage.setItem("webrtc_whep_url", endpoint);
      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      peerConnection.addTransceiver("video", { direction: "recvonly" });
      peerConnection.addTransceiver("audio", { direction: "recvonly" });

      peerConnection.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          void videoRef.current.play();
        }
      };

      peerConnection.onconnectionstatechange = () => {
        setVideoStatus(peerConnection.connectionState);
        if (["failed", "closed", "disconnected"].includes(peerConnection.connectionState)) {
          setVideoPlaying(false);
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGathering(peerConnection);

      const localDescription = peerConnection.localDescription;
      if (!localDescription?.sdp) {
        throw new Error("No se pudo crear la oferta WebRTC");
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/sdp",
          "Content-Type": "application/sdp",
        },
        body: localDescription.sdp,
      });

      if (!response.ok) {
        throw new Error(`El servidor WebRTC respondio ${response.status}`);
      }

      const answerSdp = await response.text();
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
      setVideoPlaying(true);
      setVideoStatus("Reproduciendo");
    } catch (videoError) {
      stopVideo();
      setError(videoError instanceof Error ? videoError.message : "No se pudo iniciar el stream WebRTC");
      setVideoStatus("Error");
    }
  }

  function stopVideo() {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setVideoPlaying(false);
    setVideoStatus("Detenido");
  }

  function captureVideoFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("No hay un frame de video disponible para capturar");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("No se pudo preparar la captura");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("No se pudo generar la imagen");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `webrtc-capture-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  function applyRange(hours: number, nextBucket: string) {
    setFrom(toIsoDate(hours));
    setTo(new Date().toISOString());
    setBucket(nextBucket);
  }

  async function submitConfig(save: boolean) {
    if (!selectedNode) return;
    setSavingConfig(true);
    setError(null);
    try {
      const parsed = JSON.parse(configText) as Record<string, unknown>;
      const response = await updateConfig(selectedNode.group_id, selectedNode.edge_node_id, {
        config: parsed,
        save,
      });
      setConfigHistory((current) => [...response.revisions, ...current]);
      const latest = await getCurrentConfig(selectedNode.group_id, selectedNode.edge_node_id);
      setCurrentConfig(latest);
      setConfigEdited(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo enviar la configuracion");
    } finally {
      setSavingConfig(false);
    }
  }

  function applySpeciesProfile(startDate: string) {
    setCalendarDraft(buildGirgolasCalendar(startDate));
  }

  function updateStage(stageKey: string, updates: Partial<CalendarStage>) {
    setCalendarDraft((current) => ({
      ...current,
      end_date: addDays(
        current.start_date,
        current.stages.reduce((max, stage) => Math.max(max, stage.key === stageKey ? updates.end_day ?? stage.end_day : stage.end_day), 0),
      ),
      stages: current.stages.map((stage) => (stage.key === stageKey ? { ...stage, ...updates } : stage)),
    }));
  }

  function updateStageSetpoint(stageKey: string, field: string, value: string) {
    const parsed = value === "" ? "" : Number(value);
    setCalendarDraft((current) => ({
      ...current,
      stages: current.stages.map((stage) => {
        if (stage.key !== stageKey) {
          return stage;
        }
        return {
          ...stage,
          setpoints: {
            ...stage.setpoints,
            [field]: Number.isFinite(parsed) ? parsed : value,
          },
        };
      }),
    }));
  }

  async function submitCalendar(save: boolean) {
    if (!selectedNode) return;
    setSavingCalendar(true);
    setError(null);
    try {
      await updateCalendar(selectedNode.group_id, selectedNode.edge_node_id, {
        calendar: calendarDraft,
        save,
      });
      const nextCalendar = await getCalendar(selectedNode.group_id, selectedNode.edge_node_id);
      setCalendarPlan(nextCalendar.calendar ?? null);
      setCalendarDraft(nextCalendar.calendar ?? calendarDraft);
      setCalendarEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el calendario");
    } finally {
      setSavingCalendar(false);
    }
  }

  return (
    <main className={`dashboard-shell${menuCollapsed ? " menu-collapsed" : ""}${mobileMenuOpen ? " mobile-menu-open" : ""}`}>
      <header className="mobile-header">
        <button aria-label="Abrir menu" className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)} type="button">
          <span aria-hidden="true">☰</span>
        </button>
        <div className="mobile-header-copy">
          <strong>Panel de cultivo</strong>
          <small>{selectedNode ? `${selectedNode.group_id} / ${selectedNode.edge_node_id}` : "Sin nodo"}</small>
        </div>
        <span className="mobile-user" title={user.username}>
          {user.username.slice(0, 1).toUpperCase()}
        </span>
      </header>

      <button aria-label="Cerrar menu" className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} type="button" />

      {menuCollapsed ? (
        <button
          aria-label="Mostrar menu"
          className="floating-menu-toggle"
          onClick={() => setMenuCollapsed(false)}
          title="Mostrar menu"
          type="button"
        >
          <span aria-hidden="true">☰</span>
        </button>
      ) : null}

      <aside className="sidebar">
        <div className="mobile-drawer-header">
          <div>
            <strong>Navegacion</strong>
            <small>{user.username} · {user.role}</small>
          </div>
          <button aria-label="Cerrar menu" className="mobile-drawer-close" onClick={() => setMobileMenuOpen(false)} type="button">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <button
          aria-label="Ocultar menu"
          className="menu-toggle"
          onClick={() => setMenuCollapsed(true)}
          title="Ocultar menu"
          type="button"
        >
          <span aria-hidden="true">☰</span>
        </button>

        <label>
          <span className="menu-label">Nodo</span>
          <select
            disabled={loading || nodes.length === 0}
            value={selectedNode ? nodeKey(selectedNode) : ""}
            onChange={(event) => {
              setSelectedNodeKey(event.target.value);
              setConfigEdited(false);
            }}
          >
            {nodes.map((device) => (
              <option key={nodeKey(device)} value={nodeKey(device)}>
                {device.group_id} / {device.edge_node_id}
              </option>
            ))}
          </select>
        </label>

        <nav className="sidebar-tabs">
          <button className={activeTab === "status" ? "tab-button active" : "tab-button"} onClick={() => { setActiveTab("status"); setMobileMenuOpen(false); }} type="button">
            <span>Estado actual</span>
          </button>
          <button className={activeTab === "system" ? "tab-button active" : "tab-button"} onClick={() => { setActiveTab("system"); setMobileMenuOpen(false); }} type="button">
            <span>Estado del sistema</span>
          </button>
          <button className={activeTab === "history" ? "tab-button active" : "tab-button"} onClick={() => { setActiveTab("history"); setMobileMenuOpen(false); }} type="button">
            <span>Historicos</span>
          </button>
          <button className={activeTab === "calendar" ? "tab-button active" : "tab-button"} onClick={() => { setActiveTab("calendar"); setMobileMenuOpen(false); }} type="button">
            <span>Calendario</span>
          </button>
          <button className={activeTab === "video" ? "tab-button active" : "tab-button"} onClick={() => { setActiveTab("video"); setMobileMenuOpen(false); }} type="button">
            <span>Video en vivo</span>
          </button>
          <button className={activeTab === "config" ? "tab-button active" : "tab-button"} onClick={() => { setActiveTab("config"); setMobileMenuOpen(false); }} type="button">
            <span>Configuracion</span>
          </button>
          {user.role === "admin" ? (
            <button className={activeTab === "users" ? "tab-button active" : "tab-button"} onClick={() => { setActiveTab("users"); setMobileMenuOpen(false); }} type="button">
              <span>Usuarios</span>
            </button>
          ) : null}
        </nav>

        <div className="user-card">
          <span className="menu-label">Sesion activa</span>
          <strong>{user.username}</strong>
          <small>{user.role}</small>
        </div>

        <button
          aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          className="secondary-button theme-button"
          onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          type="button"
        >
          <span>{theme === "dark" ? "Modo light" : "Modo dark"}</span>
        </button>

        <button aria-label="Cerrar sesion" className="secondary-button logout-button" onClick={() => void handleLogout()} type="button">
          <span>Cerrar sesion</span>
        </button>
      </aside>

      <section className="dashboard-content">
        {error ? <p className="error-text">{error}</p> : null}

        {!selectedNode ? (
          <section className="panel-card">
            <div className="empty-state">No hay nodos disponibles. Esperando mensajes MQTT normalizados.</div>
          </section>
        ) : null}

        {selectedNode && activeTab === "status" ? (
          <>
            <section className="metric-section">
              <div className="section-header">
                <div>
                  <p className="panel-kicker">Ambiente</p>
                </div>
              </div>
              {environmentMetrics.length > 0 ? (
                <div className="gauge-grid">
                  {environmentMetrics.map((metric) => (
                    <GaugeMetricCard
                      key={`${metric.device_id ?? "environment"}-${metric.metric_name}`}
                      metric={metric}
                      theme={theme}
                      title={prettyMetricName(metric.metric_name)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state compact">Esperando metricas environment/*</div>
              )}
            </section>

            <section className="metric-section">
              <div className="section-header">
                <div>
                  <p className="panel-kicker">Consumo de energia</p>
                </div>
              </div>
              {energyMetrics.length > 0 ? (
                <div className="gauge-grid energy-gauge-grid">
                  {energyMetrics.map((metric) => (
                    <GaugeMetricCard key={`${metric.device_id}-${metric.metric_name}`} metric={metric} theme={theme} title={prettyMetricName(metric.metric_name)} />
                  ))}
                </div>
              ) : (
                <div className="empty-state compact">Esperando metricas energy/* del HLW8032</div>
              )}
            </section>

            <section className="metric-section">
              <div className="section-header">
                <div>
                  <p className="panel-kicker">Control</p>
                  <h3>Actuadores</h3>
                </div>
              </div>
              {appliedOutputs.length > 0 ? (
                <div className="linear-gauge-grid">
                  {appliedOutputs.map(([name, value]) => (
                    <LinearGaugeCard key={name} label={name.replace(/_/g, " ")} theme={theme} value={typeof value === "number" ? value : String(value)} />
                  ))}
                </div>
              ) : (
                <div className="empty-state compact">Esperando outputs aplicados</div>
              )}
            </section>

            <section className="timeline-section">
              <div className="section-header">
                <div>
                  <h3>Calendario</h3>
                </div>
              </div>
              {calendarPlan && calendarTimeline ? (
                <div className="stage-timeline">
                  <div className="stage-stepper">
                    {calendarPlan.stages.map((stage, index) => {
                      const isDone = calendarTimeline.elapsedDays > stage.end_day;
                      const isCurrent = calendarTimeline.elapsedDays >= stage.start_day && calendarTimeline.elapsedDays <= stage.end_day;
                      return (
                        <div
                          className={`stage-step ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}`}
                          key={stage.key}
                          style={{ width: `${100 / calendarPlan.stages.length}%` }}
                        >
                          {index < calendarPlan.stages.length - 1 ? (
                            <span className={isDone ? "stage-connector done" : "stage-connector"} />
                          ) : null}
                          <span className="stage-node">{isDone ? "✓" : isCurrent ? `${calendarTimeline.elapsedDays - stage.start_day + 1}` : ""}</span>
                          <strong>{stage.label}</strong>
                          <small>
                            Dia {stage.start_day}-{stage.end_day}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="stage-timeline-footer">
                    <span>{calendarPlan.start_date}</span>
                    <span>Dia {calendarTimeline.elapsedDays}</span>
                    <span>{calendarPlan.end_date}</span>
                  </div>
                </div>
              ) : (
                <div className="empty-state compact">Sin calendario activo. Configuralo desde la solapa Calendario.</div>
              )}
            </section>
          </>
        ) : null}

        {selectedNode && activeTab === "system" ? (
          <>
            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Estado del sistema</p>
                  <h3>{selectedNode.group_id} / {selectedNode.edge_node_id}</h3>
                </div>
                <span className="status-pill">{statusText(overview?.status, "ready_for_control") === "Si" ? "Ready" : "No ready"}</span>
              </div>

              <div className="status-grid">
                <div><span>Modo</span><strong>{statusText(overview?.status, "mode")}</strong></div>
                <div><span>Enabled</span><strong>{statusText(overview?.status, "enabled")}</strong></div>
                <div><span>Safety shutdown</span><strong>{statusText(overview?.status, "safety_shutdown")}</strong></div>
                <div><span>Reason mask</span><strong>{statusText(overview?.status, "reason_mask")}</strong></div>
                <div><span>Heap libre</span><strong>{statusText(overview?.status, "heap_free")}</strong></div>
                <div><span>Tiempo valido</span><strong>{statusText(overview?.status, "time_valid")}</strong></div>
              </div>
            </section>
          </>
        ) : null}

        {selectedNode && activeTab === "history" ? (
          <>
            <header className="topbar">
              <div className="quick-filters">
                {RANGE_OPTIONS.map((option) => (
                  <button className="chip-button" key={option.label} onClick={() => applyRange(option.hours, option.bucket)} type="button">
                    {option.label}
                  </button>
                ))}
              </div>
            </header>

            <section className="filters-card">
              <label>
                Desde
                <input type="datetime-local" value={from.slice(0, 16)} onChange={(event) => setFrom(new Date(event.target.value).toISOString())} />
              </label>

              <label>
                Hasta
                <input type="datetime-local" value={to.slice(0, 16)} onChange={(event) => setTo(new Date(event.target.value).toISOString())} />
              </label>

              <label>
                Bucket
                <select value={bucket} onChange={(event) => setBucket(event.target.value)}>
                  {BUCKET_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="process-tabs">
              {PROCESS_OPTIONS.map((option) => (
                <button
                  className={selectedProcess === option.key ? "process-button active" : "process-button"}
                  key={option.key}
                  onClick={() => setSelectedProcess(option.key)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </section>

            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Historico compuesto</p>
                  <h3>{PROCESS_OPTIONS.find((option) => option.key === selectedProcess)?.label ?? selectedProcess}</h3>
                </div>
                <span className="status-text">
                  {querying ? "Consultando..." : `${processSeries.reduce((total, item) => total + item.points.length, 0)} puntos`}
                </span>
              </div>

              {processSeries.length > 0 ? (
                <TimeseriesChart
                  topic={PROCESS_OPTIONS.find((option) => option.key === selectedProcess)?.label ?? selectedProcess}
                  series={processSeries}
                />
              ) : (
                <div className="empty-state">No hay series disponibles para este proceso.</div>
              )}
            </section>
          </>
        ) : null}

        {selectedNode && activeTab === "calendar" ? (
          <>
            <section className="panel-card calendar-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Calendario</p>
                  <h3>{calendarEditing ? "Edicion de perfil" : "Perfil activo"}</h3>
                </div>
                <div className="calendar-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setCalendarDraft(calendarPlan ?? buildGirgolasCalendar());
                      setCalendarEditing((current) => !current);
                    }}
                    type="button"
                  >
                    {calendarEditing ? "Cancelar" : "Editar"}
                  </button>
                  {calendarEditing ? (
                    <>
                      <button disabled={savingCalendar || user.role !== "admin"} onClick={() => void submitCalendar(false)} type="button">
                        Aplicar temporal
                      </button>
                      <button disabled={savingCalendar || user.role !== "admin"} onClick={() => void submitCalendar(true)} type="button">
                        Guardar persistente
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="calendar-form">
                <label>
                  Especie
                  <select
                    disabled={!calendarEditing}
                    value={calendarDraft.species}
                    onChange={(event) => {
                      if (event.target.value === "girgolas") {
                        applySpeciesProfile(calendarDraft.start_date);
                      }
                    }}
                  >
                    <option value="girgolas">Girgolas</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="calendar-stage-list">
              {calendarDraft.stages.map((stage) => {
                const locked = isLockedStage(stage.key);
                const editable = calendarEditing && !locked;
                return (
                <article className={locked ? "calendar-stage-card locked" : "calendar-stage-card"} key={stage.key}>
                  <div className="calendar-stage-header">
                    <strong>{stage.label}</strong>
                    <span>
                      {locked ? "Solo lectura" : calendarEditing ? "Editable" : "Lectura"}
                    </span>
                  </div>
                  <div className="stage-day-grid">
                    <label>
                      Inicio
                      <input
                        disabled={!editable}
                        min={calendarDraft.start_date}
                        type="date"
                        value={stageStartDate(calendarDraft, stage)}
                        onChange={(event) => updateStage(stage.key, { start_day: dayOffsetFromDate(calendarDraft, event.target.value) })}
                      />
                    </label>
                    <label>
                      Fin
                      <input
                        disabled={!editable}
                        min={stageStartDate(calendarDraft, stage)}
                        type="date"
                        value={stageEndDate(calendarDraft, stage)}
                        onChange={(event) => updateStage(stage.key, { end_day: dayOffsetFromDate(calendarDraft, event.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="setpoint-grid">
                    {SETPOINT_FIELDS.map((field) => (
                      <label key={field.key}>
                        {field.label}
                        <div className="setpoint-input">
                          <input
                            disabled={!editable}
                            type="number"
                            value={String(stage.setpoints[field.key] ?? "")}
                            onChange={(event) => updateStageSetpoint(stage.key, field.key, event.target.value)}
                          />
                          <span>{field.unit}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </article>
              );
              })}
            </section>
          </>
        ) : null}

        {selectedNode && activeTab === "video" ? (
          <section className="panel-card video-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Streaming WebRTC</p>
                <h3>Video en vivo</h3>
              </div>
              <span className="status-text">{videoStatus}</span>
            </div>

            <div className="video-controls">
              <label>
                Endpoint WHEP
                <input
                  placeholder="https://servidor/webrtc/whep/camera"
                  type="url"
                  value={webrtcUrl}
                  onChange={(event) => setWebrtcUrl(event.target.value)}
                />
              </label>
              <div className="video-actions">
                <button disabled={videoPlaying} onClick={() => void playVideo()} type="button">
                  Play
                </button>
                <button className="secondary-button" disabled={!videoPlaying} onClick={stopVideo} type="button">
                  Stop
                </button>
                <button className="secondary-button" onClick={captureVideoFrame} type="button">
                  Capturar
                </button>
              </div>
            </div>

            <div className="video-stage">
              <video ref={videoRef} autoPlay controls muted playsInline />
              {!videoPlaying ? <div className="video-placeholder">Sin stream activo</div> : null}
            </div>
          </section>
        ) : null}

        {selectedNode && activeTab === "config" ? (
          <>
            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Configuracion actual</p>
                  <h3>{currentConfig?.source ?? "Sin confirmacion reportada"}</h3>
                </div>
                <span className="status-text">{currentConfig?.updated_at ?? "Sin fecha"}</span>
              </div>

              <textarea
                className="config-editor"
                spellCheck={false}
                value={configText}
                onChange={(event) => {
                  setConfigEdited(true);
                  setConfigText(event.target.value);
                }}
              />

              <div className="config-actions">
                <button disabled={savingConfig || user.role !== "admin"} onClick={() => void submitConfig(false)} type="button">
                  Aplicar temporal
                </button>
                <button disabled={savingConfig || user.role !== "admin"} onClick={() => void submitConfig(true)} type="button">
                  Guardar persistente
                </button>
              </div>
            </section>

            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Historial</p>
                  <h3>Cambios enviados</h3>
                </div>
              </div>
              <div className="revision-list">
                {configHistory.map((revision) => (
                  <div className="revision-row" key={revision.id}>
                    <strong>#{revision.id} {revision.status}</strong>
                    <span>{revision.requested_at}</span>
                    <small>{revision.command_topic ?? "Sin topic"}</small>
                    {revision.error ? <small className="error-text">{revision.error}</small> : null}
                  </div>
                ))}
                {configHistory.length === 0 ? <div className="empty-state">Todavia no hay cambios registrados.</div> : null}
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "users" && user.role === "admin" ? <UserManagementPanel /> : null}
      </section>
    </main>
  );
}
