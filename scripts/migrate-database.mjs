import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL before applying database migrations.");
}

const database = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const path of [
    "../database/auth-schema.sql",
    "../database/production-schema.sql",
  ]) {
    const sql = await readFile(
      fileURLToPath(new URL(path, import.meta.url)),
      "utf8",
    );
    await database.query(sql);
  }
  console.log("Authentication and production database schemas are current.");
} finally {
  await database.end();
}
