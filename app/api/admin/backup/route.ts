import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionIdentity } from "../../../lib/auth-session";
import { getDatabase } from "../../../lib/database";

async function getAdmin() {
  const cookieStore = await cookies();
  const identity = await getSessionIdentity(cookieStore.get(authCookieName)?.value);
  if (!identity) {
    return { identity: null, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  if (identity.role !== "ADMIN") {
    return { identity: null, response: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  }
  return { identity, response: null };
}

export async function GET(request: Request) {
  const { response } = await getAdmin();
  if (response) return response;
  const id = new URL(request.url).searchParams.get("id");
  const database = getDatabase();
  if (id) {
    const { rows } = await database.query<{ backup_data: unknown; created_at: Date }>(
      "SELECT backup_data, created_at FROM database_backups WHERE id = $1",
      [id],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "Backup not found." }, { status: 404 });
    }
    return new NextResponse(JSON.stringify(rows[0].backup_data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="tirupati-backup-${rows[0].created_at.toISOString().slice(0, 10)}-${id}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const { rows } = await database.query(
    `SELECT id, created_by_name AS "createdBy", created_at AS "createdAt", size_bytes AS "sizeBytes"
     FROM database_backups ORDER BY created_at DESC LIMIT 50`,
  );
  return NextResponse.json({ backups: rows }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST() {
  const { identity, response } = await getAdmin();
  if (response || !identity) return response;

  const database = getDatabase();
  const client = await database.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    const queries = {
      users: `SELECT id, name, username, role, active, created_at, updated_at
              FROM users ORDER BY id`,
      orders: `SELECT o.*,
                 COALESCE((SELECT SUM(quantity) FROM production_transactions p WHERE p.po=o.po),0)::BIGINT AS produced
               FROM production_orders o ORDER BY o.po`,
      machines: "SELECT * FROM production_machines ORDER BY name",
      productionTransactions: "SELECT * FROM production_transactions ORDER BY created_at, id",
      inspections: "SELECT * FROM quality_inspections ORDER BY inspection_date, id",
      dispatches: "SELECT * FROM dispatch_records ORDER BY created_at, id",
      dispatchTransactions: "SELECT * FROM dispatch_transactions ORDER BY created_at, id",
      wipStages: "SELECT * FROM production_wip_stages ORDER BY po, stage",
      auditLog: "SELECT * FROM audit_log ORDER BY id",
    };
    const entries = await Promise.all(
      Object.entries(queries).map(async ([key, sql]) => [
        key,
        (await client.query(sql)).rows,
      ] as const),
    );
    const snapshot = {
      format: "tirupati-production-backup-v1",
      createdAt: new Date().toISOString(),
      createdBy: identity.username,
      includesPasswordHashes: false,
      includesSessions: false,
      data: Object.fromEntries(entries),
    };
    await client.query("COMMIT");
    transactionOpen = false;

    const serialized = JSON.stringify(snapshot);
    const id = randomUUID();
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      `INSERT INTO database_backups (id, created_by, created_by_name, size_bytes, backup_data)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, identity.id, identity.name, Buffer.byteLength(serialized), serialized],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'BACKUP_CREATED','BACKUP',$3,$4)`,
      [identity.id, identity.username, id, JSON.stringify({ sizeBytes: Buffer.byteLength(serialized) })],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Unable to roll back the failed backup snapshot.", rollbackError);
      }
    }
    console.error("Database backup failed.", error);
    return NextResponse.json({ error: "Database backup could not be created." }, { status: 500 });
  } finally {
    client.release();
  }
}
