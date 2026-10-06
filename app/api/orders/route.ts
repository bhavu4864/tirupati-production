import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionIdentity } from "../../lib/auth-session";
import { getDatabase } from "../../lib/database";

const priorities = ["Normal", "High", "Urgent"] as const;
const statuses = [
  "Pending",
  "Running",
  "Ready in Stock",
  "Raw Material Required",
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
  created_at: Date;
  updated_at: Date;
};

function mapOrder(row: OrderRow) {
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
    status: row.status,
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
    typeof value.status !== "string" ||
    !statuses.includes(value.status as (typeof statuses)[number])
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
    status: value.status as OrderInput["status"],
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
    `SELECT id, company_name, po_number, order_by, item_name, material, quantity, rate,
            purchase_date::TEXT, due_date::TEXT, priority, status, created_at, updated_at
     FROM simple_customer_orders
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
  if (!input) {
    return NextResponse.json({ error: "Enter valid order details." }, { status: 400 });
  }

  const id = randomUUID();
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
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
    return NextResponse.json({ order: mapOrder(rows[0]) }, { status: 201 });
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
