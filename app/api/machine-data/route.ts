import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionIdentity } from "../../lib/auth-session";
import { getDatabase } from "../../lib/database";

type MachineRow = {
  id: string;
  machine_name: string;
  status: "Active" | "Inactive";
  has_production_history?: boolean;
};

type RecordRow = {
  id: string;
  machine_id: string;
  machine_name: string;
  production_date: string;
  part_no: string;
  morning_pcs: number | null;
  evening_pcs: number | null;
  morning_start_time: string;
  morning_end_time: string;
  evening_start_time: string;
  evening_end_time: string;
  total_pcs: number;
  operator_name: string;
  breakdown: "Yes" | "No";
  breakdown_reason: string;
};

type MachineDataInput = {
  machineId: string;
  date: string;
  partNo: string;
  morningPcs: number | null;
  eveningPcs: number | null;
  morningStartTime: string;
  morningEndTime: string;
  eveningStartTime: string;
  eveningEndTime: string;
  operatorName: string;
  breakdown: "Yes" | "No";
  breakdownReason: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validPcs(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) >= 0);
}

function parseMachineData(value: unknown): MachineDataInput | null {
  if (!isRecord(value)) return null;
  const machineId = value.machineId;
  const date = value.date;
  const partNo = value.partNo;
  const morningPcs = value.morningPcs ?? null;
  const eveningPcs = value.eveningPcs ?? null;
  const morningStartTime = value.morningStartTime;
  const morningEndTime = value.morningEndTime;
  const eveningStartTime = value.eveningStartTime;
  const eveningEndTime = value.eveningEndTime;
  const operatorName = value.operatorName;
  const breakdown = value.breakdown;
  const breakdownReason = value.breakdownReason;
  if (
    typeof machineId !== "string" ||
    !validDate(date) ||
    typeof partNo !== "string" ||
    !partNo.trim() ||
    partNo.trim().length > 120 ||
    !validPcs(morningPcs) ||
    !validPcs(eveningPcs) ||
    (morningPcs === null && eveningPcs === null) ||
    !validTime(morningStartTime) ||
    !validTime(morningEndTime) ||
    morningStartTime >= morningEndTime ||
    !validTime(eveningStartTime) ||
    !validTime(eveningEndTime) ||
    eveningStartTime >= eveningEndTime ||
    morningEndTime > eveningStartTime ||
    typeof operatorName !== "string" ||
    !operatorName.trim() ||
    operatorName.trim().length > 120 ||
    (breakdown !== "Yes" && breakdown !== "No") ||
    typeof breakdownReason !== "string" ||
    breakdownReason.length > 1000 ||
    (breakdown === "Yes" && !breakdownReason.trim()) ||
    (breakdown === "No" && breakdownReason.trim())
  ) {
    return null;
  }
  return {
    machineId,
    date,
    partNo: partNo.trim(),
    morningPcs,
    eveningPcs,
    morningStartTime,
    morningEndTime,
    eveningStartTime,
    eveningEndTime,
    operatorName: operatorName.trim(),
    breakdown,
    breakdownReason: breakdown === "Yes" ? breakdownReason.trim() : "",
  };
}

function mapRecord(record: RecordRow) {
  return {
    id: record.id,
    machineId: record.machine_id,
    machineName: record.machine_name,
    date: record.production_date,
    partNo: record.part_no,
    morningPcs: record.morning_pcs,
    eveningPcs: record.evening_pcs,
    morningStartTime: record.morning_start_time.slice(0, 5),
    morningEndTime: record.morning_end_time.slice(0, 5),
    eveningStartTime: record.evening_start_time.slice(0, 5),
    eveningEndTime: record.evening_end_time.slice(0, 5),
    totalPcs: (record.morning_pcs ?? 0) + (record.evening_pcs ?? 0),
    operatorName: record.operator_name,
    breakdown: record.breakdown,
    breakdownReason: record.breakdown_reason,
  };
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
      `SELECT m.id, m.machine_name, m.status,
              EXISTS (
                SELECT 1
                FROM machine_daily_records r
                WHERE r.machine_id = m.id
                UNION ALL
                SELECT 1
                FROM production_transactions p
                WHERE p.machine = m.machine_name
              ) AS has_production_history
       FROM machine_master m
       ORDER BY m.machine_name`,
    ),
    database.query<RecordRow>(
      `SELECT id, machine_id, machine_name, production_date::TEXT, part_no,
              morning_pcs, evening_pcs,
              TO_CHAR(morning_start_time, 'HH24:MI') AS morning_start_time,
              TO_CHAR(morning_end_time, 'HH24:MI') AS morning_end_time,
              TO_CHAR(evening_start_time, 'HH24:MI') AS evening_start_time,
              TO_CHAR(evening_end_time, 'HH24:MI') AS evening_end_time,
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
      hasProductionHistory: machine.has_production_history,
    })),
    records: records.rows.map(mapRecord),
  }, { headers: { "Cache-Control": "no-store" } });
}

async function saveMachineData(request: Request, isEditing = false) {
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
  const editingId = isEditing && isRecord(body) && typeof body.id === "string"
    ? body.id
    : undefined;
  const input = parseMachineData(body);
  if (!input || (isEditing && !editingId)) {
    return NextResponse.json({ error: "Enter valid daily machine data." }, { status: 400 });
  }

  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const { rows: previousRows } = editingId
      ? await client.query<RecordRow>(
          `SELECT id, machine_id, machine_name, production_date::TEXT, part_no,
                  morning_pcs, evening_pcs,
                  TO_CHAR(morning_start_time, 'HH24:MI') AS morning_start_time,
                  TO_CHAR(morning_end_time, 'HH24:MI') AS morning_end_time,
                  TO_CHAR(evening_start_time, 'HH24:MI') AS evening_start_time,
                  TO_CHAR(evening_end_time, 'HH24:MI') AS evening_end_time,
                  operator_name, breakdown, breakdown_reason
           FROM machine_daily_records WHERE id=$1 FOR UPDATE`,
          [editingId],
        )
      : { rows: [] as RecordRow[] };
    const previous = previousRows[0];
    if (editingId && !previous) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Production record was not found." }, { status: 404 });
    }
    const { rows: machineRows } = await client.query<MachineRow>(
      "SELECT id, machine_name, status FROM machine_master WHERE id=$1 FOR UPDATE",
      [input.machineId],
    );
    const machine = machineRows[0];
    if (
      !machine ||
      (machine.status !== "Active" && previous?.machine_id !== machine.id)
    ) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Select an active machine." }, { status: 400 });
    }
    let id = editingId ?? randomUUID();
    let recordUpdated = Boolean(editingId);
    let morningPcs = input.morningPcs;
    let eveningPcs = input.eveningPcs;
    let morningStartTime = input.morningStartTime;
    let morningEndTime = input.morningEndTime;
    let eveningStartTime = input.eveningStartTime;
    let eveningEndTime = input.eveningEndTime;
    let breakdown = input.breakdown;
    let breakdownReason = input.breakdownReason;

    if (!editingId) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
        [machine.id, `${input.date}:${input.partNo.toLocaleLowerCase("en-US")}`],
      );
      const { rows: matchingRows } = await client.query<RecordRow>(
        `SELECT id, machine_id, machine_name, production_date::TEXT, part_no,
                morning_pcs, evening_pcs,
                TO_CHAR(morning_start_time, 'HH24:MI') AS morning_start_time,
                TO_CHAR(morning_end_time, 'HH24:MI') AS morning_end_time,
                TO_CHAR(evening_start_time, 'HH24:MI') AS evening_start_time,
                TO_CHAR(evening_end_time, 'HH24:MI') AS evening_end_time,
                operator_name, breakdown, breakdown_reason
         FROM machine_daily_records
         WHERE machine_id=$1 AND production_date=$2 AND LOWER(part_no)=LOWER($3)
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [machine.id, input.date, input.partNo],
      );
      const matchingRecord = matchingRows[0];
      if (matchingRecord) {
        recordUpdated = true;
        id = matchingRecord.id;
        morningPcs = input.morningPcs ?? matchingRecord.morning_pcs;
        eveningPcs = input.eveningPcs ?? matchingRecord.evening_pcs;
        if (input.morningPcs === null) {
          morningStartTime = matchingRecord.morning_start_time;
          morningEndTime = matchingRecord.morning_end_time;
        }
        if (input.eveningPcs === null) {
          eveningStartTime = matchingRecord.evening_start_time;
          eveningEndTime = matchingRecord.evening_end_time;
        }
        if (matchingRecord.breakdown === "Yes" && input.breakdown === "No") {
          breakdown = "Yes";
          breakdownReason = matchingRecord.breakdown_reason;
        }
      }
    } else if (
      previous &&
      (
        previous.machine_id !== machine.id ||
        previous.production_date !== input.date ||
        previous.part_no.toLocaleLowerCase("en-US") !== input.partNo.toLocaleLowerCase("en-US")
      )
    ) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
        [machine.id, `${input.date}:${input.partNo.toLocaleLowerCase("en-US")}`],
      );
      const duplicate = await client.query(
        `SELECT id FROM machine_daily_records
         WHERE machine_id=$1 AND production_date=$2 AND LOWER(part_no)=LOWER($3) AND id<>$4
         LIMIT 1 FOR UPDATE`,
        [machine.id, input.date, input.partNo, id],
      );
      if (duplicate.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({
          error: "A production record already exists for this date, machine, and part. Edit that record instead.",
        }, { status: 409 });
      }
    }

    const { rows: savedRows } = await client.query<RecordRow>(
      editingId
        ? `UPDATE machine_daily_records
           SET machine_id=$2, machine_name=$3, production_date=$4, part_no=$5,
               morning_pcs=$6, evening_pcs=$7, morning_start_time=$8, morning_end_time=$9,
               evening_start_time=$10, evening_end_time=$11, operator_name=$12,
               breakdown=$13, breakdown_reason=$14
           WHERE id=$1
           RETURNING id, machine_id, machine_name, production_date::TEXT, part_no,
             morning_pcs, evening_pcs,
             TO_CHAR(morning_start_time, 'HH24:MI') AS morning_start_time,
             TO_CHAR(morning_end_time, 'HH24:MI') AS morning_end_time,
             TO_CHAR(evening_start_time, 'HH24:MI') AS evening_start_time,
             TO_CHAR(evening_end_time, 'HH24:MI') AS evening_end_time,
             operator_name, breakdown, breakdown_reason`
        : `INSERT INTO machine_daily_records
             (id, machine_id, machine_name, production_date, part_no, morning_pcs, evening_pcs,
              morning_start_time, morning_end_time, evening_start_time, evening_end_time,
              operator_name, breakdown, breakdown_reason, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO UPDATE SET
             machine_id=EXCLUDED.machine_id, machine_name=EXCLUDED.machine_name,
             production_date=EXCLUDED.production_date, part_no=EXCLUDED.part_no,
             morning_pcs=EXCLUDED.morning_pcs, evening_pcs=EXCLUDED.evening_pcs,
             morning_start_time=EXCLUDED.morning_start_time, morning_end_time=EXCLUDED.morning_end_time,
             evening_start_time=EXCLUDED.evening_start_time, evening_end_time=EXCLUDED.evening_end_time,
             operator_name=EXCLUDED.operator_name, breakdown=EXCLUDED.breakdown,
             breakdown_reason=EXCLUDED.breakdown_reason
           RETURNING id, machine_id, machine_name, production_date::TEXT, part_no,
             morning_pcs, evening_pcs,
             TO_CHAR(morning_start_time, 'HH24:MI') AS morning_start_time,
             TO_CHAR(morning_end_time, 'HH24:MI') AS morning_end_time,
             TO_CHAR(evening_start_time, 'HH24:MI') AS evening_start_time,
             TO_CHAR(evening_end_time, 'HH24:MI') AS evening_end_time,
             operator_name, breakdown, breakdown_reason`,
      editingId
        ? [
            id, machine.id, machine.machine_name, input.date, input.partNo,
            input.morningPcs, input.eveningPcs, input.morningStartTime, input.morningEndTime,
            input.eveningStartTime, input.eveningEndTime, input.operatorName,
            input.breakdown, input.breakdownReason,
          ]
        : [
            id, machine.id, machine.machine_name, input.date, input.partNo,
            morningPcs, eveningPcs, morningStartTime, morningEndTime,
            eveningStartTime, eveningEndTime, input.operatorName,
            breakdown, breakdownReason, user.id,
          ],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,$3,'MACHINE_DATA',$4,$5::jsonb)`,
      [
        user.id,
        user.username,
        recordUpdated ? "UPDATE" : "CREATE",
        machine.machine_name,
        JSON.stringify({
          date: input.date,
          partNo: input.partNo,
          morningPcs,
          eveningPcs,
          totalPcs: (morningPcs ?? 0) + (eveningPcs ?? 0),
        }),
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      { id, record: mapRecord(savedRows[0]) },
      { status: recordUpdated ? 200 : 201 },
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function POST(request: Request) {
  return saveMachineData(request);
}

export async function PUT(request: Request) {
  return saveMachineData(request, true);
}
