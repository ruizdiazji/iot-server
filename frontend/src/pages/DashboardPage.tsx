import { useEffect, useState } from "react";

import { getTimeseries, getTopics, logout } from "../api";
import { TimeseriesChart } from "../components/TimeseriesChart";
import { UserManagementPanel } from "../components/UserManagementPanel";
import type { SeriesPoint, User } from "../types";

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

export function DashboardPage({ user, onLoggedOut }: DashboardPageProps) {
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [from, setFrom] = useState(toIsoDate(1));
  const [to, setTo] = useState(new Date().toISOString());
  const [bucket, setBucket] = useState("1 minute");
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadTopics() {
      try {
        const response = await getTopics();
        if (!active) {
          return;
        }
        setTopics(response.topics);
        setSelectedTopic(response.topics[0] ?? "");
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los topics");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTopics();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTopic) {
      setPoints([]);
      return;
    }

    let active = true;

    async function loadSeries() {
      setQuerying(true);
      setError(null);
      try {
        const response = await getTimeseries({
          topic: selectedTopic,
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

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">MQTT Dashboard</p>
          <h2>Series temporales</h2>
          <p className="sidebar-copy">
            Explora historicos por topic con agregacion temporal desde TimescaleDB.
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
          <div className="quick-filters">
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

        <section className="filters-card">
          <label>
            Topic
            <select
              disabled={loading || topics.length === 0}
              value={selectedTopic}
              onChange={(event) => setSelectedTopic(event.target.value)}
            >
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>

          <label>
            Desde
            <input
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(event) => setFrom(new Date(event.target.value).toISOString())}
            />
          </label>

          <label>
            Hasta
            <input
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(event) => setTo(new Date(event.target.value).toISOString())}
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
        </section>

        <section className="panel-card">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Panel principal</p>
              <h3>{selectedTopic || "Sin topic seleccionado"}</h3>
            </div>
            <span className="status-text">{querying ? "Consultando..." : `${points.length} puntos`}</span>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          {selectedTopic ? (
            <TimeseriesChart topic={selectedTopic} points={points} />
          ) : (
            <div className="empty-state">No hay topics disponibles para mostrar.</div>
          )}
        </section>

        {user.role === "admin" ? <UserManagementPanel /> : null}
      </section>
    </main>
  );
}
