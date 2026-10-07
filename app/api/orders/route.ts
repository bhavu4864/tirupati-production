import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionIdentity } from "../../lib/auth-session";
import { getDatabase } from "../../lib/database";

const priorities = ["Normal", "High", "Urgent"] as const;
const statuses = [
  "Pending",
  "Processing",
  "Packing",
  "Partial Delivery",
  "Fully Dispatched",
] as const;

type OrderInput = {
  companyName: string;
  poNumber: string;
  orderBy: "Email" | "WhatsApp";
  itemName: string;
  material: string;
  quantity: number;
  rate: number;
  purchaseDate: string;
  dueDate: string;
  priority: (typeof priorities)[number];
  status: (typeof statuses)[number];
};

type OrderRow = {
  id: string;
  company_name: string;
  po_number: string;
  order_by: OrderInput["orderBy"];
  item_name: string;
  material: string;
  quantity: number;
  rate: string;
  purchase_date: string;
  due_date: string;
  priority: OrderInput["priority"];
  status: OrderInput["status"];
  dispatched_quantity: number;
  dispatch_record_count: number;
  created_at: Date;
  updated_at: Date;
};

function mapOrder(row: OrderRow) {
  const dispatchedQuantity = Number(row.dispatched_quantity ?? 0);
  return {
    id: row.id,
    companyName: row.company_name,
    poNumber: row.po_number,
    orderBy: row.order_by,
    itemName: row.item_name,
    material: row.material,
    quantity: row.quantity,
    rate: Number(row.rate),
    purchaseDate: row.purchase_date,
    dueDate: row.due_date,
    priority: row.priority,
    status: dispatchedQuantity >= row.quantity
      ? "Fully Dispatched"
      : dispatchedQuantity > 0
        ? "Partial Delivery"
        : row.status,
    dispatchedQuantity,
    remainingQuantity: Math.max(0, row.quantity - dispatchedQuantity),
    dispatchRecordCount: Number(row.dispatch_record_count ?? 0),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseOrder(value: unknown): OrderInput | null {
  if (!isRecord(value)) return null;
  const status = value.status === undefined ? "Pending" : value.status;
  if (
    typeof value.companyName !== "string" ||
    !value.companyName.trim() ||
    value.companyName.trim().length > 160 ||
    typeof value.poNumber !== "string" ||
    !value.poNumber.trim() ||
    value.poNumber.trim().length > 120 ||
    (value.orderBy !== "Email" && value.orderBy !== "WhatsApp") ||
    typeof value.itemName !== "string" ||
    !value.itemName.trim() ||
    value.itemName.trim().length > 160 ||
    typeof value.material !== "string" ||
    !value.material.trim() ||
    value.material.trim().length > 160 ||
    !Number.isInteger(value.quantity) ||
    Number(value.quantity) <= 0 ||
    typeof value.rate !== "number" ||
    !Number.isFinite(value.rate) ||
    value.rate < 0 ||
    !validDate(value.purchaseDate) ||
    !validDate(value.dueDate) ||
    value.dueDate < value.purchaseDate ||
    typeof value.priority !== "string" ||
    !priorities.includes(value.priority as (typeof priorities)[number]) ||
    typeof status !== "string" ||
    !statuses.includes(status as (typeof statuses)[number])
  ) {
    return null;
  }

  return {
    companyName: value.companyName.trim(),
    poNumber: value.poNumber.trim(),
    orderBy: value.orderBy,
    itemName: value.itemName.trim(),
    material: value.material.trim(),
    quantity: Number(value.quantity),
    rate: value.rate,
    purchaseDate: value.purchaseDate,
    dueDate: value.dueDate,
    priority: value.priority as OrderInput["priority"],
    status: status as OrderInput["status"],
  };
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function currentUser() {
  const cookieStore = await cookies();
  return getSessionIdentity(cookieStore.get(authCookieName)?.value);
}

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { rows } = await getDatabase().query<OrderRow>(
    `SELECT o.id, o.company_name, o.po_number, o.order_by, o.item_name, o.material,
            o.quantity, o.rate, o.purchase_date::TEXT, o.due_date::TEXT, o.priority,
            CASE
              WHEN COALESCE(d.dispatched, 0) >= o.quantity THEN 'Fully Dispatched'
              WHEN COALESCE(d.dispatched, 0) > 0 THEN 'Partial Delivery'
              ELSE o.status
            END AS status,
            COALESCE(d.dispatched, 0)::INTEGER AS dispatched_quantity,
            COALESCE(d.dispatch_record_count, 0)::INTEGER AS dispatch_record_count,
            o.created_at, o.updated_at
     FROM simple_customer_orders o
     LEFT JOIN (
       SELECT dr.po, SUM(dt.quantity)::BIGINT AS dispatched,
              COUNT(DISTINCT dr.id)::INTEGER AS dispatch_record_count
       FROM dispatch_records dr
       LEFT JOIN dispatch_transactions dt ON dt.dispatch_id = dr.id
       GROUP BY dr.po
     ) d ON LOWER(d.po) = LOWER(o.po_number)
     ORDER BY created_at DESC, po_number`,
  );
  return NextResponse.json({ orders: rows.map(mapOrder) }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
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
  const input = parseOrder(body);
  if (!input || input.status === "Partial Delivery" || input.status === "Fully Dispatched") {
    return NextResponse.json({ error: "Enter valid order details." }, { status: 400 });
  }

  const id = randomUUID();
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    const { rows: dispatchRows } = await client.query<{
      dispatched_quantity: number;
      dispatch_record_count: number;
    }>(
      `SELECT COALESCE(SUM(dt.quantity), 0)::INTEGER AS dispatched_quantity,
              COUNT(DISTINCT dr.id)::INTEGER AS dispatch_record_count
       FROM dispatch_records dr
       LEFT JOIN dispatch_transactions dt ON dt.dispatch_id = dr.id
       WHERE LOWER(dr.po) = LOWER($1)`,
      [input.poNumber],
    );
    const dispatchedQuantity = Number(dispatchRows[0].dispatched_quantity);
    if (dispatchedQuantity > input.quantity) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        error: `Ordered quantity cannot be less than the ${dispatchedQuantity} PCS already dispatched for this PO.`,
      }, { status: 409 });
    }
    const { rows } = await client.query<OrderRow>(
      `INSERT INTO simple_customer_orders
         (id, company_name, po_number, order_by, item_name, material, quantity, rate,
          purchase_date, due_date, priority, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, company_name, po_number, order_by, item_name, material, quantity,
                 rate, purchase_date::TEXT, due_date::TEXT, priority, status,
                 created_at, updated_at`,
      [
        id,
        input.companyName,
        input.poNumber,
        input.orderBy,
        input.itemName,
        input.material,
        input.quantity,
        input.rate,
        input.purchaseDate,
        input.dueDate,
        input.priority,
        input.status,
      ],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'CREATE','ORDER',$3,$4::jsonb)`,
      [user.id, user.username, input.poNumber, JSON.stringify({ quantity: input.quantity })],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      order: mapOrder({
        ...rows[0],
        dispatched_quantity: dispatchedQuantity,
        dispatch_record_count: Number(dispatchRows[0].dispatch_record_count),
      }),
    }, { status: 201 });
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
