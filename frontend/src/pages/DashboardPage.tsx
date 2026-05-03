import { useEffect, useState } from "react";

import { getTimeseries, getTopicValues, logout } from "../api";
import { TimeseriesChart } from "../components/TimeseriesChart";
import { UserManagementPanel } from "../components/UserManagementPanel";
import type { SeriesPoint, TopicSnapshot, User } from "../types";

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

interface DashboardPageProps {
  user: User;
  onLoggedOut: () => void;
}

function toIsoDate(hoursBack: number) {
  return new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  return new Date(value).toISOString();
}

function formatValue(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 1 : 3,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function getFreshness(recordedAt: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(recordedAt).getTime()) / 60000));

  if (minutes < 2) {
    return "Ahora";
  }

  if (minutes < 60) {
    return `Hace ${minutes} min`;
  }

  const hours = Math.round(minutes / 60);
  return `Hace ${hours} h`;
}

export function DashboardPage({ user, onLoggedOut }: DashboardPageProps) {
  const [snapshots, setSnapshots] = useState<TopicSnapshot[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [from, setFrom] = useState(toIsoDate(1));
  const [to, setTo] = useState(new Date().toISOString());
  const [bucket, setBucket] = useState("1 minute");
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSnapshots() {
      try {
        const response = await getTopicValues();
        if (!active) {
          return;
        }
        setSnapshots(response.topics);
        setSelectedTopic((currentTopic) => currentTopic ?? response.topics[0]?.topic ?? null);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los valores actuales");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSnapshots();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTopic) {
      setPoints([]);
      return;
    }

    const topic = selectedTopic;
    let active = true;

    async function loadSeries() {
      setQuerying(true);
      setError(null);
      try {
        const response = await getTimeseries({
          topic,
          from,
          to,
          bucket,
        });
        if (active) {
          setPoints(response.points);
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
  }, [bucket, from, selectedTopic, to]);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  function applyRange(hours: number, nextBucket: string) {
    setFrom(toIsoDate(hours));
    setTo(new Date().toISOString());
    setBucket(nextBucket);
  }

  async function refreshSnapshots() {
    setLoading(true);
    setError(null);
    try {
      const response = await getTopicValues();
      setSnapshots(response.topics);
      setSelectedTopic((currentTopic) => currentTopic ?? response.topics[0]?.topic ?? null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "No se pudieron actualizar los valores");
    } finally {
      setLoading(false);
    }
  }

  const selectedSnapshot = snapshots.find((snapshot) => snapshot.topic === selectedTopic);

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">MQTT Dashboard</p>
          <h2>Telemetria</h2>
          <p className="sidebar-copy">
            Estado actual por topic y analisis historico desde TimescaleDB.
          </p>
        </div>

        <div className="user-card">
          <span>Sesion activa</span>
          <strong>{user.username}</strong>
          <small>{user.role}</small>
        </div>

        <button className="secondary-button" onClick={() => void handleLogout()} type="button">
          Cerrar sesion
        </button>
      </aside>

      <section className="dashboard-content">
        <header className="topbar">
          <div>
            <p className="panel-kicker">Vista general</p>
            <h1>Valores actuales</h1>
          </div>
          <div className="quick-filters">
            <button
              className="chip-button"
              disabled={loading}
              onClick={() => void refreshSnapshots()}
              type="button"
            >
              Actualizar
            </button>
            {RANGE_OPTIONS.map((option) => (
              <button
                className="chip-button"
                key={option.label}
                onClick={() => applyRange(option.hours, option.bucket)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        {error ? <p className="error-text">{error}</p> : null}

        <section className="topic-grid" aria-busy={loading}>
          {snapshots.map((snapshot) => (
            <button
              className={`topic-tile ${snapshot.topic === selectedTopic ? "is-selected" : ""}`}
              key={snapshot.topic}
              onClick={() => setSelectedTopic(snapshot.topic)}
              type="button"
            >
              <span className="topic-name">{snapshot.topic}</span>
              <strong>{formatValue(snapshot.value)}</strong>
              <span className="topic-meta">{getFreshness(snapshot.recorded_at)}</span>
            </button>
          ))}
        </section>

        {snapshots.length === 0 && !loading ? (
          <div className="empty-state">No hay topics con valores almacenados para mostrar.</div>
        ) : null}

        <section className="detail-layout">
          <div className="filters-card detail-controls">
            <label>
              Desde
              <input
                type="datetime-local"
                value={toDateTimeLocal(from)}
                onChange={(event) => setFrom(fromDateTimeLocal(event.target.value))}
              />
            </label>

            <label>
              Hasta
              <input
                type="datetime-local"
                value={toDateTimeLocal(to)}
                onChange={(event) => setTo(fromDateTimeLocal(event.target.value))}
              />
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
          </div>

          <section className="panel-card">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Detalle historico</p>
                <h3>{selectedTopic || "Selecciona un topic"}</h3>
              </div>
              <span className="status-text">{querying ? "Consultando..." : `${points.length} puntos`}</span>
            </div>

            {selectedSnapshot ? (
              <dl className="current-summary">
                <div>
                  <dt>Valor actual</dt>
                  <dd>{formatValue(selectedSnapshot.value)}</dd>
                </div>
                <div>
                  <dt>Ultimo registro</dt>
                  <dd>{formatDate(selectedSnapshot.recorded_at)}</dd>
                </div>
              </dl>
            ) : null}

            {selectedTopic ? (
              <TimeseriesChart topic={selectedTopic} points={points} />
            ) : (
              <div className="empty-state">Selecciona un topic para abrir el dashboard historico.</div>
            )}
          </section>
        </section>

        {user.role === "admin" ? <UserManagementPanel /> : null}
      </section>
    </main>
  );
}
