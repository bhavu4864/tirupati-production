import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { getDatabase } from "./database";
import type { AuthUser } from "./auth-types";

export const authCookieName = "tbi_session";

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("AUTH_SECRET must be configured with at least 32 bytes.");
  }
  return secret;
}

function hashSessionToken(token: string) {
  return createHmac("sha256", getAuthSecret()).update(token).digest("hex");
}

export async function createSession(
  userId: string,
  remember: boolean,
  user: AuthUser,
) {
  const lifetime = remember ? 30 * 24 * 60 * 60 : 12 * 60 * 60;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM auth_sessions WHERE expires_at <= NOW()");
    await client.query(
      `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 second'))`,
      [tokenHash, userId, lifetime],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module)
       VALUES ($1,$2,'LOGIN','AUTH')`,
      [userId, user.username],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return {
    token,
    maxAge: remember ? lifetime : undefined,
  };
}

export async function getSessionUser(
  token: string | undefined,
): Promise<AuthUser | null> {
  if (!token) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const database = getDatabase();
  const { rows } = await database.query<AuthUser>(
    `SELECT u.username, u.name, u.role
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
       AND u.active = TRUE`,
    [hashSessionToken(token)],
  );
  return rows[0] ?? null;
}

export async function getSessionIdentity(token: string | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const database = getDatabase();
  const { rows } = await database.query<AuthUser & { id: string }>(
    `SELECT u.id, u.username, u.name, u.role
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
       AND u.active = TRUE`,
    [hashSessionToken(token)],
  );
  return rows[0] ?? null;
}

export async function deleteSession(
  token: string | undefined,
  identity?: AuthUser & { id: string },
) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM auth_sessions WHERE token_hash = $1", [
      hashSessionToken(token),
    ]);
    if (identity) {
      await client.query(
        `INSERT INTO audit_log (user_id, username, action, module)
         VALUES ($1,$2,'LOGOUT','AUTH')`,
        [identity.id, identity.username],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
