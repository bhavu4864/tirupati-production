import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionIdentity } from "../../lib/auth-session";
import { getDatabase } from "../../lib/database";

type MachineRow = {
  id: string;
  machine_name: string;
  machine_code: string;
  machine_type: string;
  status: "Active" | "Inactive";
  location: string;
  notes: string;
  created_at: Date;
  updated_at: Date;
};

function toMachine(row: MachineRow) {
  return {
    id: row.id,
    machineName: row.machine_name,
    machineCode: row.machine_code,
    machineType: row.machine_type,
    status: row.status,
    location: row.location,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const user = await getSessionIdentity(cookieStore.get(authCookieName)?.value);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
  if (includeInactive && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }
  const { rows } = await getDatabase().query<MachineRow>(
    `SELECT id, machine_name, machine_code, machine_type, status, location, notes,
            created_at, updated_at
     FROM machine_master
     ${includeInactive ? "" : "WHERE status = 'Active'"}
     ORDER BY machine_name`,
  );
  return NextResponse.json({ machines: rows.map(toMachine) }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const user = await getSessionIdentity(cookieStore.get(authCookieName)?.value);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("machineName" in body) ||
    typeof body.machineName !== "string" ||
    !body.machineName.trim() ||
    body.machineName.trim().length > 120
  ) {
    return NextResponse.json(
      { error: "Enter a machine name." },
      { status: 400 },
    );
  }

  const id = randomUUID();
  const machineName = body.machineName.trim();
  const machineCode = machineName;
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<MachineRow>(
      `INSERT INTO machine_master
         (id, machine_name, machine_code, machine_type, status, location, notes)
       VALUES ($1,$2,$3,'Other','Active','','')
       RETURNING id, machine_name, machine_code, machine_type, status, location, notes,
                 created_at, updated_at`,
      [id, machineName, machineCode],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'CREATE','MACHINE_MASTER',$3,$4::jsonb)`,
      [user.id, user.username, id, JSON.stringify({ machineName, machineCode })],
    );
    await client.query("COMMIT");
    return NextResponse.json({ machine: toMachine(rows[0]) }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "That machine name or code is already in use." },
        { status: 409 },
      );
    }
    throw error;
  } finally {
    client.release();
  }
}
