import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionIdentity } from "../../../lib/auth-session";
import { getDatabase } from "../../../lib/database";

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
    body.machineName.trim().length > 120 ||
    !("status" in body) ||
    (body.status !== "Active" && body.status !== "Inactive")
  ) {
    return NextResponse.json({ error: "Enter a machine name and status." }, { status: 400 });
  }

  const { id } = await context.params;
  const machineName = body.machineName.trim();
  const machineCode = machineName;
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const { rows: existingRows } = await client.query<{ machine_name: string }>(
      "SELECT machine_name FROM machine_master WHERE id = $1 FOR UPDATE",
      [id],
    );
    const existing = existingRows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Machine was not found." }, { status: 404 });
    }

    if (existing.machine_name !== machineName) {
      await client.query(
        `UPDATE machine_daily_records
         SET machine_name = $2
         WHERE machine_id = $1`,
        [id, machineName],
      );
      await client.query(
        "UPDATE production_orders SET machine = $2 WHERE machine = $1",
        [existing.machine_name, machineName],
      );
    }

    const { rows } = await client.query(
      `UPDATE machine_master
       SET machine_name = $2, machine_code = $3, status = $4, updated_at = NOW()
       WHERE id = $1
       RETURNING id, machine_name AS "machineName", status`,
      [id, machineName, machineCode, body.status],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'UPDATE','MACHINE_MASTER',$3,$4::jsonb)`,
      [user.id, user.username, id, JSON.stringify({ machineName, status: body.status })],
    );
    await client.query("COMMIT");
    return NextResponse.json({ machine: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "That machine name is already in use." }, { status: 409 });
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const user = await getSessionIdentity(cookieStore.get(authCookieName)?.value);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  }

  const { id } = await context.params;
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ machine_name: string }>(
      "SELECT machine_name FROM machine_master WHERE id = $1 FOR UPDATE",
      [id],
    );
    const machine = rows[0];
    if (!machine) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Machine was not found." }, { status: 404 });
    }
    const { rows: historyRows } = await client.query<{ has_history: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM machine_daily_records WHERE machine_id = $1
         UNION ALL
         SELECT 1 FROM production_transactions WHERE machine = $2
       ) AS has_history`,
      [id, machine.machine_name],
    );
    if (historyRows[0].has_history) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        error: "This machine has production history and cannot be permanently deleted. Deactivate or archive it instead.",
        hasProductionHistory: true,
      }, { status: 409 });
    }

    await client.query("DELETE FROM machine_master WHERE id = $1", [id]);
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'DELETE','MACHINE_MASTER',$3,$4::jsonb)`,
      [user.id, user.username, id, JSON.stringify({ machineName: machine.machine_name })],
    );
    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23503") {
      return NextResponse.json({
        error: "This machine is referenced by production history and cannot be permanently deleted. Deactivate or archive it instead.",
        hasProductionHistory: true,
      }, { status: 409 });
    }
    throw error;
  } finally {
    client.release();
  }
}
