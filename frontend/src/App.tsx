import { useEffect, useState } from "react";

import { getMe, login } from "./api";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import type { User } from "./types";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const currentUser = await getMe();
        if (active) {
          setUser(currentUser);
        }
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setCheckingAuth(false);
        }
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(username: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      const currentUser = await login({ username, password });
      setUser(currentUser);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "No se pudo iniciar sesion");
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return <main className="splash-screen">Cargando dashboard...</main>;
  }

  if (!user) {
    return <LoginPage onSubmit={handleLogin} error={error} loading={loading} />;
  }

  return <DashboardPage user={user} onLoggedOut={() => setUser(null)} />;
}

