import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionIdentity } from "../../lib/auth-session";
import { getDatabase } from "../../lib/database";

type MachineRow = {
  id: string;
  machine_name: string;
  status: "Active" | "Inactive";
};

type RecordRow = {
  id: string;
  machine_id: string;
  machine_name: string;
  production_date: string;
  part_no: string;
  morning_pcs: number;
  evening_pcs: number;
  total_pcs: number;
  operator_name: string;
  breakdown: "Yes" | "No";
  breakdown_reason: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const user = await getSessionIdentity(cookieStore.get(authCookieName)?.value);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const requestedDate = params.get("date");
  if (params.has("date") && (!requestedDate || !validDate(requestedDate))) {
    return NextResponse.json({ error: "Select a valid production date." }, { status: 400 });
  }
  const database = getDatabase();
  const [machines, records] = await Promise.all([
    database.query<MachineRow>(
      `SELECT id, machine_name, status FROM machine_master
       ORDER BY machine_name`,
    ),
    database.query<RecordRow>(
      `SELECT id, machine_id, machine_name, production_date::TEXT, part_no,
              morning_pcs, evening_pcs, (morning_pcs + evening_pcs)::INTEGER AS total_pcs,
              operator_name, breakdown, breakdown_reason
       FROM machine_daily_records
       WHERE ($1::DATE IS NULL OR production_date = $1::DATE)
       ORDER BY production_date DESC, created_at DESC`,
      [requestedDate],
    ),
  ]);
  return NextResponse.json({
    machines: machines.rows.map((machine) => ({
      id: machine.id,
      machineName: machine.machine_name,
      status: machine.status,
    })),
    records: records.rows.map((record) => ({
      id: record.id,
      machineId: record.machine_id,
      machineName: record.machine_name,
      date: record.production_date,
      partNo: record.part_no,
      morningPcs: record.morning_pcs,
      eveningPcs: record.evening_pcs,
      totalPcs: record.total_pcs,
      operatorName: record.operator_name,
      breakdown: record.breakdown,
      breakdownReason: record.breakdown_reason,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const user = await getSessionIdentity(cookieStore.get(authCookieName)?.value);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "PRODUCTION") {
    return NextResponse.json({ error: "Production access required." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (
    !isRecord(body) ||
    typeof body.machineId !== "string" ||
    !validDate(body.date) ||
    typeof body.partNo !== "string" || !body.partNo.trim() || body.partNo.trim().length > 120 ||
    !Number.isInteger(body.morningPcs) || Number(body.morningPcs) < 0 ||
    !Number.isInteger(body.eveningPcs) || Number(body.eveningPcs) < 0 ||
    typeof body.operatorName !== "string" || !body.operatorName.trim() || body.operatorName.trim().length > 120 ||
    (body.breakdown !== "Yes" && body.breakdown !== "No") ||
    typeof body.breakdownReason !== "string" || body.breakdownReason.length > 1000 ||
    (body.breakdown === "Yes" && !body.breakdownReason.trim()) ||
    (body.breakdown === "No" && body.breakdownReason.trim())
  ) {
    return NextResponse.json({ error: "Enter valid daily machine data." }, { status: 400 });
  }

  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const { rows: machineRows } = await client.query<MachineRow>(
      "SELECT id, machine_name, status FROM machine_master WHERE id=$1 FOR UPDATE",
      [body.machineId],
    );
    const machine = machineRows[0];
    if (!machine || machine.status !== "Active") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Select an active machine." }, { status: 400 });
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO machine_daily_records
         (id, machine_id, machine_name, production_date, part_no, morning_pcs, evening_pcs,
          operator_name, breakdown, breakdown_reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        machine.id,
        machine.machine_name,
        body.date,
        body.partNo.trim(),
        Number(body.morningPcs),
        Number(body.eveningPcs),
        body.operatorName.trim(),
        body.breakdown,
        body.breakdown === "Yes" ? body.breakdownReason.trim() : "",
        user.id,
      ],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'CREATE','MACHINE_DATA',$3,$4::jsonb)`,
      [
        user.id,
        user.username,
        machine.machine_name,
        JSON.stringify({
          date: body.date,
          partNo: body.partNo,
          morningPcs: body.morningPcs,
          eveningPcs: body.eveningPcs,
          totalPcs: Number(body.morningPcs) + Number(body.eveningPcs),
        }),
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
