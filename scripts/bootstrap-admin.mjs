import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.AUTH_SECRET;
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!databaseUrl) throw new Error("Set DATABASE_URL before bootstrapping.");
if (!authSecret || Buffer.byteLength(authSecret) < 32) {
  throw new Error("Set AUTH_SECRET to a random value of at least 32 bytes.");
}
if (!name || name.length > 120) {
  throw new Error("Set BOOTSTRAP_ADMIN_NAME (1-120 characters).");
}
if (
  !username ||
  username.length < 3 ||
  username.length > 254 ||
  (username.includes("@")
    ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)
    : !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(username))
) {
  throw new Error("Set a valid BOOTSTRAP_ADMIN_USERNAME.");
}
if (
  !password ||
  password.length < 12 ||
  Buffer.byteLength(password, "utf8") > 1024 ||
  !/[a-z]/.test(password) ||
  !/[A-Z]/.test(password) ||
  !/\d/.test(password) ||
  !/[^A-Za-z0-9]/.test(password)
) {
  throw new Error(
    "BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters and include lowercase, uppercase, a number, and a symbol.",
  );
}

function hashPassword(value) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(
      value,
      salt,
      64,
      { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(
          ["scrypt", 32_768, 8, 1, salt.toString("base64url"), key.toString("base64url")].join("$"),
        );
      },
    );
  });
}

const database = new Pool({ connectionString: databaseUrl });
try {
  const schema = await readFile(
    fileURLToPath(new URL("../database/auth-schema.sql", import.meta.url)),
    "utf8",
  );
  await database.query(schema);
  const { rows } = await database.query("SELECT COUNT(*)::int AS count FROM users");
  if (rows[0].count !== 0) {
    throw new Error(
      "Users already exist; bootstrap is only for initializing an empty user database.",
    );
  }
  await database.query(
    `INSERT INTO users (id, name, username, password_hash, role, active)
     VALUES ($1, $2, $3, $4, 'ADMIN', TRUE)`,
    [randomUUID(), name, username, await hashPassword(password)],
  );
  console.log(`Initial administrator ${username} created.`);
} finally {
  await database.end();
}
