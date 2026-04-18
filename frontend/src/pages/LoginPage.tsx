import { FormEvent, useState } from "react";

interface LoginPageProps {
  onSubmit: (username: string, password: string) => Promise<void>;
  error: string | null;
  loading: boolean;
}

export function LoginPage({ onSubmit, error, loading }: LoginPageProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(username, password);
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-copy">
          <p className="eyebrow">MQTT Observability</p>
          <h1>Dashboard temporal para tus topics MQTT</h1>
          <p className="subtitle">
            Consultas historicas desde TimescaleDB con una interfaz enfocada en
            exploracion, filtros y analisis rapido.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Usuario
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label>
            Contrasena
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button disabled={loading} type="submit">
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </section>
    </main>
  );
}
