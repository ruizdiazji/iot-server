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
          <p className="eyebrow">Plataforma de monitoreo</p>
          <h1>Panel de control para el cultivo de hongos</h1>
          <p className="subtitle">
            Control de los procesos y consultas historicas enfocadas en
            exploracion, filtros y analisis rapido del estado del sistema.
          </p>
        </div>

        <div className="login-art" aria-hidden="true">
          <div className="mushroom-scene">
            <span className="mushroom-cap">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="mushroom-stem">
              <i className="eye-left" />
              <i className="eye-right" />
              <i className="smile" />
            </span>
            <span className="mushroom-base" />
            <span className="mini-mushroom mini-one" />
            <span className="mini-mushroom mini-two" />
            <span className="mini-mushroom mini-three" />
          </div>
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
