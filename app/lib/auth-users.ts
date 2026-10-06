import "server-only";

import { randomUUID } from "node:crypto";
import { getDatabase } from "./database";
import { hashPassword, verifyPassword } from "./password";
import { isUserRole, type AuthUser, type UserRole } from "./auth-types";

export type ManagedUser = AuthUser & {
  id: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type UserRow = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

const publicUserColumns =
  "id, name, username, role, active, created_at, updated_at";

function toManagedUser(row: UserRow): ManagedUser {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string) {
  const username = value.trim();
  if (username.length < 3 || username.length > 254) return false;
  if (username.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
  }
  return /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(username);
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<{ id: string; user: AuthUser } | null> {
  const database = getDatabase();
  const { rows } = await database.query<{
    id: string;
    name: string;
    username: string;
    role: UserRole;
    active: boolean;
    password_hash: string;
  }>(
    `SELECT id, name, username, role, active, password_hash
     FROM users WHERE LOWER(username) = $1`,
    [normalizeUsername(username)],
  );
  const candidate = rows[0];
  const passwordMatches = candidate
    ? await verifyPassword(password, candidate.password_hash)
    : await hashPassword(password).then(() => false);
  if (!candidate || !candidate.active || !passwordMatches) return null;
  return {
    id: candidate.id,
    user: {
      username: candidate.username,
      name: candidate.name,
      role: candidate.role,
    },
  };
}

export async function listUsers() {
  const { rows } = await getDatabase().query<UserRow>(
    `SELECT ${publicUserColumns} FROM users ORDER BY LOWER(name), id`,
  );
  return rows.map(toManagedUser);
}

export async function createUser(input: {
  name: string;
  username: string;
  password: string;
  role: UserRole;
}, actor: { id: string; username: string }) {
  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (id, name, username, password_hash, role, active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING ${publicUserColumns}`,
      [
        id,
        input.name.trim(),
        normalizeUsername(input.username),
        passwordHash,
        input.role,
      ],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'USER_CREATED','USERS',$3,$4)`,
      [actor.id, actor.username, id, JSON.stringify({ username: rows[0].username, role: rows[0].role })],
    );
    await client.query("COMMIT");
    return toManagedUser(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUser(
  id: string,
  input: {
    name: string;
    username: string;
    role: UserRole;
    active: boolean;
  },
  actor: { id: string; username: string },
) {
  const database = getDatabase();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<UserRow>(
      `UPDATE users
       SET name = $2, username = $3, role = $4, active = $5, updated_at = NOW()
       WHERE id = $1
       RETURNING ${publicUserColumns}`,
      [
        id,
        input.name.trim(),
        normalizeUsername(input.username),
        input.role,
        input.active,
      ],
    );
    if (rows[0]) {
      await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [id]);
      await client.query(
        `INSERT INTO audit_log (user_id, username, action, module, reference, details)
         VALUES ($1,$2,$3,'USERS',$4,$5)`,
        [
          actor.id,
          actor.username,
          input.active ? "USER_EDITED" : "USER_DEACTIVATED",
          id,
          JSON.stringify({ username: rows[0].username, role: rows[0].role, active: rows[0].active }),
        ],
      );
    }
    await client.query("COMMIT");
    return rows[0] ? toManagedUser(rows[0]) : null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resetUserPassword(
  id: string,
  password: string,
  actor: { id: string; username: string },
) {
  const passwordHash = await hashPassword(password);
  const database = getDatabase();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
      [id, passwordHash],
    );
    if (rowCount) {
      await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [id]);
      await client.query(
        `INSERT INTO audit_log (user_id, username, action, module, reference)
         VALUES ($1,$2,'USER_PASSWORD_RESET','USERS',$3)`,
        [actor.id, actor.username, id],
      );
    }
    await client.query("COMMIT");
    return rowCount !== 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function isValidRole(value: unknown): value is UserRole {
  return isUserRole(value);
}
