"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import MainNavigation from "../components/main-navigation";
import { isUserRole, type UserRole } from "../lib/auth-types";

type ManagedUser = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type UserDraft = Pick<ManagedUser, "name" | "username" | "role" | "active">;
type BackupStatus = {
  id: string;
  createdBy: string;
  createdAt: string;
  sizeBytes: number;
};

const roles: UserRole[] = [
  "ADMIN",
  "PRODUCTION",
  "QUALITY",
  "DISPATCH",
  "VIEWER",
];

async function responseError(response: Response) {
  const result = await response.json().catch(() => null) as
    | { error?: string }
    | null;
  return result?.error ?? "The request could not be completed.";
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [backups, setBackups] = useState<BackupStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("VIEWER");
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const result = await response.json() as { users: ManagedUser[] };
      setUsers(result.users);
      setDrafts(Object.fromEntries(result.users.map((user) => [
        user.id,
        {
          name: user.name,
          username: user.username,
          role: user.role,
          active: user.active,
        },
      ])));
    } catch {
      setError("Unable to connect to the user management service.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBackups = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/backup", { cache: "no-store" });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const result = await response.json() as { backups: BackupStatus[] };
      setBackups(result.backups);
    } catch {
      setError("Unable to load database backup status.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
      void loadBackups();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBackups, loadUsers]);

  async function createBackup() {
    setBackupBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/backup", { method: "POST" });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const result = await response.json() as { id: string };
      await loadBackups();
      const download = document.createElement("a");
      download.href = `/api/admin/backup?id=${encodeURIComponent(result.id)}`;
      download.click();
      setMessage("Database backup created and download started.");
    } catch {
      setError("Unable to create a database backup.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password, role }),
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      setName("");
      setUsername("");
      setPassword("");
      setRole("VIEWER");
      setMessage("User created.");
      await loadUsers();
    } catch {
      setError("Unable to connect to the user management service.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveUser(id: string) {
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(drafts[id]),
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      setMessage("User updated. Their existing sessions have been signed out.");
      await loadUsers();
    } catch {
      setError("Unable to connect to the user management service.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(id: string) {
    const nextPassword = resetPasswords[id] ?? "";
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(id)}/password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: nextPassword }),
        },
      );
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      setResetPasswords((current) => ({ ...current, [id]: "" }));
      setMessage("Password reset. The user's existing sessions have been signed out.");
    } catch {
      setError("Unable to connect to the user management service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-950 px-4 py-4 text-white sm:px-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-lg font-bold tracking-tight sm:text-2xl">
            TIRUPATI BRASS INDUSTRIES
          </p>
          <p className="text-xs text-slate-400 sm:text-sm">User Management</p>
        </div>
      </header>
      <MainNavigation />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold">Database backups</h2>
              <p className="mt-1 text-sm text-slate-500">
                Exports production records, transaction history, audit history, and user account metadata. Password hashes and active sessions are excluded.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void createBackup()}
              disabled={backupBusy}
              className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {backupBusy ? "Creating backup..." : "Create & download backup"}
            </button>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            {backups.length > 0 ? (
              <>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recent backup status
              </h3>
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex flex-col justify-between gap-2 text-sm sm:flex-row sm:items-center"
                >
                  <span className="text-slate-600">
                    {new Date(backup.createdAt).toLocaleString()} · {backup.createdBy} · {Math.ceil(backup.sizeBytes / 1024)} KB
                  </span>
                  <a
                    href={`/api/admin/backup?id=${encodeURIComponent(backup.id)}`}
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    Download
                  </a>
                </div>
              ))}
              </>
            ) : (
              <p className="text-sm text-slate-500">No database backups have been created yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold">Create user</h1>
          <p className="mt-1 text-sm text-slate-500">
            Passwords must be at least 12 characters and include uppercase,
            lowercase, a number, and a symbol.
          </p>
          <form
            onSubmit={createAccount}
            className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <label className="text-sm font-medium">
              Name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium">
              Username / Email
              <input
                required
                maxLength={254}
                autoComplete="off"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium">
              Initial password
              <input
                required
                minLength={12}
                maxLength={1024}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium">
              Role
              <select
                value={role}
                onChange={(event) => {
                  if (isUserRole(event.target.value)) setRole(event.target.value);
                }}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {roles.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Create user
              </button>
            </div>
          </form>
        </section>

        {(message || error) && (
          <p
            role={error ? "alert" : "status"}
            className={`rounded-lg border px-4 py-3 text-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {error || message}
          </p>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold">Users</h2>
          </div>
          {loading ? (
            <p className="p-5 text-sm text-slate-500">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No users found.</p>
          ) : (
            <div className="divide-y divide-slate-200">
              {users.map((user) => {
                const draft = drafts[user.id] ?? {
                  name: user.name,
                  username: user.username,
                  role: user.role,
                  active: user.active,
                };
                return (
                  <article key={user.id} className="space-y-4 p-5">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <label className="text-xs font-semibold text-slate-500">
                        Name
                        <input
                          required
                          maxLength={120}
                          value={draft.name}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [user.id]: { ...draft, name: event.target.value },
                          }))}
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-500">
                        Username / Email
                        <input
                          required
                          maxLength={254}
                          value={draft.username}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [user.id]: { ...draft, username: event.target.value },
                          }))}
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-500">
                        Role
                        <select
                          value={draft.role}
                          onChange={(event) => {
                            const nextRole = event.target.value;
                            if (isUserRole(nextRole)) {
                              setDrafts((current) => ({
                                ...current,
                                [user.id]: { ...draft, role: nextRole },
                              }));
                            }
                          }}
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                        >
                          {roles.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 pt-5 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [user.id]: { ...draft, active: event.target.checked },
                          }))}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Active
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => void saveUser(user.id)}
                          disabled={submitting}
                          className="w-full rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                        >
                          Save changes
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-end">
                      <label className="text-xs font-semibold text-slate-500 sm:max-w-md sm:flex-1">
                        Reset password
                        <input
                          type="password"
                          minLength={12}
                          maxLength={1024}
                          autoComplete="new-password"
                          placeholder="New password (never shown)"
                          value={resetPasswords[user.id] ?? ""}
                          onChange={(event) => setResetPasswords((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }))}
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void resetPassword(user.id)}
                        disabled={submitting || !(resetPasswords[user.id] ?? "")}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Reset password
                      </button>
                      <span className="text-xs text-slate-400">
                        Created {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
