import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionIdentity } from "../../../lib/auth-session";
import { getDatabase } from "../../../lib/database";

const priorities = ["Normal", "High", "Urgent"] as const;
const statuses = [
  "Pending",
  "Running",
  "Ready in Stock",
  "Raw Material Required",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

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
    !isRecord(body) ||
    typeof body.companyName !== "string" || !body.companyName.trim() || body.companyName.trim().length > 160 ||
    typeof body.poNumber !== "string" || !body.poNumber.trim() || body.poNumber.trim().length > 120 ||
    (body.orderBy !== "Email" && body.orderBy !== "WhatsApp") ||
    typeof body.itemName !== "string" || !body.itemName.trim() || body.itemName.trim().length > 160 ||
    typeof body.material !== "string" || !body.material.trim() || body.material.trim().length > 160 ||
    !Number.isInteger(body.quantity) || Number(body.quantity) <= 0 ||
    typeof body.rate !== "number" || !Number.isFinite(body.rate) || body.rate < 0 ||
    !validDate(body.purchaseDate) || !validDate(body.dueDate) || body.dueDate < body.purchaseDate ||
    typeof body.priority !== "string" || !priorities.includes(body.priority as (typeof priorities)[number]) ||
    typeof body.status !== "string" || !statuses.includes(body.status as (typeof statuses)[number])
  ) {
    return NextResponse.json({ error: "Enter valid order details." }, { status: 400 });
  }

  const { id } = await context.params;
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE simple_customer_orders
       SET company_name=$2, po_number=$3, order_by=$4, item_name=$5, material=$6,
           quantity=$7, rate=$8, purchase_date=$9, due_date=$10, priority=$11,
           status=$12, updated_at=NOW()
       WHERE id=$1
       RETURNING id, company_name AS "companyName", po_number AS "poNumber",
         order_by AS "orderBy", item_name AS "itemName", material, quantity, rate,
         purchase_date::TEXT AS "purchaseDate", due_date::TEXT AS "dueDate",
         priority, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        id,
        body.companyName.trim(),
        body.poNumber.trim(),
        body.orderBy,
        body.itemName.trim(),
        body.material.trim(),
        Number(body.quantity),
        body.rate,
        body.purchaseDate,
        body.dueDate,
        body.priority,
        body.status,
      ],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Order was not found." }, { status: 404 });
    }
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'UPDATE','ORDER',$3,'{}'::jsonb)`,
      [user.id, user.username, String(body.poNumber)],
    );
    await client.query("COMMIT");
    return NextResponse.json({ order: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "That PO number already exists." }, { status: 409 });
    }
    throw error;
  } finally {
    client.release();
  }
}
