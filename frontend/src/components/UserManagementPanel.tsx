import { FormEvent, useEffect, useState } from "react";

import { createUser, getUsers, updateUser } from "../api";
import type { UserItem } from "../types";

export function UserManagementPanel() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      const response = await getUsers();
      setUsers(response.users);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await createUser({ username, password, role });
      setUsername("");
      setPassword("");
      setRole("viewer");
      await loadUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo crear el usuario");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleUser(user: UserItem) {
    try {
      await updateUser(user.username, { is_active: !user.is_active });
      await loadUsers();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "No se pudo actualizar el usuario");
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Administracion</p>
          <h3>Usuarios del dashboard</h3>
        </div>
        <span className="status-text">{loading ? "Cargando..." : `${users.length} usuarios`}</span>
      </div>

      <form className="user-form" onSubmit={handleSubmit}>
        <label>
          Usuario
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>

        <label>
          Contrasena
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label>
          Rol
          <select value={role} onChange={(event) => setRole(event.target.value as "admin" | "viewer")}>
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
        </label>

        <button disabled={saving} type="submit">
          {saving ? "Creando..." : "Crear usuario"}
        </button>
      </form>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="users-table">
        <div className="users-row users-head">
          <span>Usuario</span>
          <span>Rol</span>
          <span>Estado</span>
          <span>Accion</span>
        </div>

        {users.map((user) => (
          <div className="users-row" key={user.id}>
            <span>{user.username}</span>
            <span>{user.role}</span>
            <span>{user.is_active ? "activo" : "inactivo"}</span>
            <button
              className="table-button"
              onClick={() => void handleToggleUser(user)}
              type="button"
            >
              {user.is_active ? "Desactivar" : "Activar"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
