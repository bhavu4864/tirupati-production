import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AuthUser } from "./auth-types";
import { getDatabase } from "./database";

type State = {
  machines: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  inspections: Array<Record<string, unknown>>;
  dispatches: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
};

type DatabaseContext = {
  user: AuthUser;
  userId: string;
};

function integer(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

function parseState(value: unknown): State | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  if (
    !Array.isArray(state.machines) ||
    !Array.isArray(state.orders) ||
    !Array.isArray(state.inspections) ||
    !Array.isArray(state.dispatches) ||
    !Array.isArray(state.activities)
  ) return null;
  return state as State;
}

async function loadState(client: PoolClient) {
  const [orders, machines, inspections, dispatches, activities, wipStages, summary, version] =
    await Promise.all([
      client.query(
        `SELECT * FROM production_order_balances
         ORDER BY "createdAt", po`,
      ),
      client.query(
        `SELECT m.name, m.brand, m.status, COALESCE(m.order_po, '') AS "order",
                m.part, m.material, m.target,
                COALESCE(p.produced, 0)::INTEGER AS produced,
               m.downtime
         FROM production_machines m
           LEFT JOIN (
           SELECT po, SUM(quantity)::BIGINT AS produced
           FROM production_transactions GROUP BY po
           ) p ON p.po = m.order_po
         ORDER BY m.name`,
      ),
      client.query(
        `SELECT i.id, i.inspection_date::TEXT AS date, i.po, o.customer, o.part,
                o.material, o.machine, i.batch,
                COALESCE(p.produced, 0)::INTEGER AS "quantityProduced",
                i.quantity_inspected AS "quantityInspected",
                i.quantity_passed AS "quantityPassed",
                i.quantity_rejected AS "quantityRejected", i.inspector,
                i.status, i.remarks, i.measurements,
                i.material_certificate AS "materialCertificate"
         FROM quality_inspections i
         JOIN production_orders o USING (po)
         LEFT JOIN (
           SELECT po, SUM(quantity)::BIGINT AS produced
           FROM production_transactions GROUP BY po
         ) p USING (po)
         ORDER BY i.inspection_date DESC, i.created_at DESC`,
      ),
      client.query(
        `SELECT d.id, d.po, d.quantity,
                COALESCE(s.dispatched, 0)::INTEGER AS "dispatchedQuantity",
                d.date::TEXT AS date, d.status, d.remarks
         FROM dispatch_records d
         LEFT JOIN (
           SELECT dispatch_id, SUM(quantity)::BIGINT AS dispatched
           FROM dispatch_transactions GROUP BY dispatch_id
         ) s ON s.dispatch_id = d.id
         ORDER BY d.created_at DESC`,
      ),
      client.query(
        `SELECT id::DOUBLE PRECISION AS id, machine, order_po AS "order", message,
                created_at::DOUBLE PRECISION AS "createdAt"
         FROM production_activities ORDER BY id DESC LIMIT 12`,
      ),
      client.query(
        `SELECT po, part, machine, stage, quantity, status, updated_at AS "updatedAt"
         FROM production_wip_stages ORDER BY po, stage`,
      ),
      client.query(
        `SELECT
           COALESCE((SELECT SUM(target) FROM production_orders WHERE status <> 'Cancelled'),0)::INTEGER AS "totalTarget",
           COALESCE((SELECT SUM(produced) FROM production_order_balances WHERE status <> 'Cancelled'),0)::INTEGER AS "totalProduced",
           COALESCE((SELECT SUM("dispatchQuantity") FROM production_order_balances WHERE status <> 'Cancelled'),0)::INTEGER AS "totalDispatched",
           COALESCE((SELECT SUM("remainingQuantity") FROM production_order_balances WHERE status <> 'Cancelled'),0)::INTEGER AS "remainingProduction",
           (SELECT COUNT(*) FROM production_machines WHERE status='RUNNING')::INTEGER AS "activeMachines",
           (SELECT COUNT(*) FROM production_machines WHERE status='IDLE')::INTEGER AS "idleMachines",
           (SELECT COUNT(*) FROM production_machines)::INTEGER AS "machineCount",
           COALESCE(ROUND(100.0 * (SELECT COUNT(*) FROM production_machines WHERE status='RUNNING')
                 / NULLIF((SELECT COUNT(*) FROM production_machines),0)),0)::INTEGER AS "machineUtilization",
           COALESCE((SELECT SUM("remainingQuantity" + "wipQuantity")
                     FROM production_order_balances WHERE status <> 'Cancelled'),0)::INTEGER AS "totalWip",
           (SELECT COUNT(*) FROM production_orders WHERE status='In Production')::INTEGER AS "ordersInProgress",
           COALESCE((SELECT SUM(quantity_inspected) FROM quality_inspections),0)::INTEGER AS "totalInspected",
           COALESCE((SELECT SUM(quantity_passed) FROM quality_inspections),0)::INTEGER AS "totalPassed",
           COALESCE((SELECT SUM(quantity_rejected) FROM quality_inspections),0)::INTEGER AS "totalRejected",
           COALESCE((
             SELECT SUM(GREATEST(0, produced - inspected))
             FROM (
               SELECT b.produced,
                      COALESCE((SELECT SUM(i.quantity_inspected) FROM quality_inspections i WHERE i.po=b.po),0) AS inspected
               FROM production_order_balances b WHERE b.status <> 'Cancelled'
             ) pending
           ),0)::INTEGER AS "pendingInspection",
           COALESCE((SELECT SUM(quantity) FROM dispatch_transactions WHERE created_at::DATE=CURRENT_DATE),0)::INTEGER AS "dispatchedToday"
         FROM (SELECT 1) one`,
      ),
      client.query("SELECT version FROM production_state WHERE singleton = TRUE"),
    ]);

  return {
    version: Number(version.rows[0]?.version ?? 0),
    summary: summary.rows[0],
    state: {
      orders: orders.rows,
      machines: machines.rows,
      inspections: inspections.rows,
      dispatches: dispatches.rows,
      activities: activities.rows,
      wipStages: wipStages.rows,
    },
  };
}

export async function getProductionSnapshot() {
  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = await loadState(client);
    await client.query("COMMIT");
    return snapshot;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function canMutate(kind: string, role: AuthUser["role"]) {
  if (role === "ADMIN") return true;
  if (kind === "production" || kind === "machine") return role === "PRODUCTION";
  if (kind === "inspection") return role === "QUALITY";
  if (kind === "dispatch") return role === "DISPATCH";
  return false;
}

function stable(value: unknown) {
  return JSON.stringify(value);
}

function withoutKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}

function assertScopedChanges(
  incoming: State,
  current: State,
  kind: string,
  role: AuthUser["role"],
) {
  if (role === "ADMIN") return;

  const equal = (left: unknown, right: unknown) => stable(left) === stable(right);
  const ordersByPo = new Map(current.orders.map((order) => [order.po, order]));
  if (incoming.orders.length !== current.orders.length) {
    throw new Error("Only administrators can create or remove orders.");
  }
  for (const order of incoming.orders) {
    const existing = ordersByPo.get(order.po);
    if (!existing) throw new Error("Only administrators can create or remove orders.");
    if (kind === "production") {
      const currentDetails = withoutKeys(existing, ["produced", "status"]);
      const incomingDetails = withoutKeys(order, ["produced", "status"]);
      if (!equal(currentDetails, incomingDetails)) {
        throw new Error("Only administrators can edit order details.");
      }
      if (
        !integer(order.produced) ||
        Number(order.produced) < Number(existing.produced) ||
        (order.status !== existing.status &&
          !(order.status === "Completed" && Number(order.produced) >= Number(order.target)))
      ) {
        throw new Error("Production may only increase and complete an order at its target.");
      }
    } else if (kind === "machine") {
      const currentDetails = withoutKeys(existing, ["status"]);
      const incomingDetails = withoutKeys(order, ["status"]);
      if (!equal(currentDetails, incomingDetails)) {
        throw new Error("Machine operators cannot edit production order details.");
      }
    } else if (!equal(existing, order)) {
      throw new Error("You are not authorized to change order data.");
    }
  }

  if (kind === "dispatch" || kind === "inspection") {
    if (!equal(incoming.machines, current.machines) || !equal(incoming.orders, current.orders)) {
      throw new Error("You are not authorized to change machine or order data.");
    }
  }
  if (kind === "dispatch" && !equal(incoming.inspections, current.inspections)) {
    throw new Error("Dispatch users cannot change inspection results.");
  }
  if (kind === "inspection" && !equal(incoming.dispatches, current.dispatches)) {
    throw new Error("Quality users cannot change dispatch records.");
  }
  if (kind === "machine" || kind === "production") {
    if (!equal(incoming.inspections, current.inspections) || !equal(incoming.dispatches, current.dispatches)) {
      throw new Error("Production users cannot change quality or dispatch records.");
    }
  }
  if (kind === "machine" || kind === "production") {
    if (incoming.machines.length !== current.machines.length) {
      throw new Error("Machine operators cannot add or remove machines.");
    }
    const machinesByName = new Map(current.machines.map((machine) => [machine.name, machine]));
    for (const machine of incoming.machines) {
      const existing = machinesByName.get(machine.name);
      if (!existing) throw new Error("Machine operators cannot add or remove machines.");
      const ignoredKeys = kind === "production" ? ["status", "produced"] : ["status"];
      const currentDetails = withoutKeys(existing, ignoredKeys);
      const incomingDetails = withoutKeys(machine, ignoredKeys);
      if (!equal(currentDetails, incomingDetails)) {
        throw new Error("Machine operators may only change production or machine status.");
      }
    }
  }
}

function requiredString(value: unknown, label: string, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`Invalid ${label}.`);
  }
  return value.trim();
}

function assertQuantity(value: unknown, label: string, allowZero = true) {
  if (!integer(value) || (!allowZero && Number(value) === 0)) {
    throw new Error(`${label} must be a ${allowZero ? "non-negative" : "positive"} whole number.`);
  }
  return Number(value);
}

function optionalOrderDate(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

async function migration(client: PoolClient, state: State, context: DatabaseContext) {
  const existing = await client.query("SELECT COUNT(*)::INTEGER AS count FROM production_orders");
  if (existing.rows[0].count !== 0) {
    return { version: Number((await client.query("SELECT version FROM production_state WHERE singleton = TRUE")).rows[0].version), state: null };
  }

  const machines = state.machines;
  const orders = state.orders;
  for (const raw of orders) {
    const order = raw;
    const po = requiredString(order.po, "PO number");
    const target = assertQuantity(order.target, "Order quantity", false);
    const produced = assertQuantity(order.produced, "Production quantity");
    if (produced > target) throw new Error(`Existing production exceeds the target for ${po}.`);
    await client.query(
      `INSERT INTO production_orders
       (po, customer, part, material, target, machine, due_date, priority, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        po, requiredString(order.customer, "customer"), requiredString(order.part, "part"),
        requiredString(order.material, "material"), target,
        requiredString(order.machine, "machine"), order.dueDate, order.priority, order.status,
      ],
    );
  }
  for (const raw of machines) {
    const machine = raw;
    await client.query(
      `INSERT INTO production_machines
       (name, brand, status, order_po, part, material, target, downtime)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        requiredString(machine.name, "machine"), requiredString(machine.brand, "machine brand"),
        machine.status, typeof machine.order === "string" && machine.order ? machine.order : null,
        requiredString(machine.part, "machine part"), requiredString(machine.material, "machine material"),
        assertQuantity(machine.target, "Machine target"),
        assertQuantity(machine.downtime, "Machine downtime"),
      ],
    );
  }
  for (const raw of orders) {
    const order = raw;
    const quantity = assertQuantity(order.produced, "Production quantity");
    if (!quantity) continue;
    const machine = requiredString(order.machine, "machine");
    const machineExists = machines.some((item) => item.name === machine);
    if (!machineExists) throw new Error(`Machine ${machine} for ${order.po} was not found.`);
    await client.query(
      `INSERT INTO production_transactions
       (id, idempotency_key, po, machine, quantity, operator_id, operator_name, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'MIGRATED',NOW())`,
      [`MIG-PROD-${order.po}`, `MIG-PROD-${order.po}`, order.po, machine, quantity, context.userId, context.user.name],
    );
  }
  for (const raw of state.inspections) {
    const item = raw;
    const inspected = assertQuantity(item.quantityInspected, "Inspected quantity");
    const passed = assertQuantity(item.quantityPassed, "Passed quantity");
    const rejected = assertQuantity(item.quantityRejected, "Rejected quantity");
    if (passed + rejected !== inspected) throw new Error(`QC totals are invalid for ${item.id}.`);
    await client.query(
      `INSERT INTO quality_inspections
       (id, po, inspection_date, batch, quantity_inspected, quantity_passed, quantity_rejected,
        inspector, inspector_id, status, remarks, measurements, material_certificate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        requiredString(item.id, "inspection reference"), item.po, item.date,
        requiredString(item.batch, "inspection batch"), inspected, passed, rejected,
        requiredString(item.inspector, "inspector"), context.userId, item.status,
        typeof item.remarks === "string" ? item.remarks : "",
        JSON.stringify(Array.isArray(item.measurements) ? item.measurements : []),
        item.materialCertificate,
      ],
    );
  }
  for (const raw of state.dispatches) {
    const item = raw;
    const quantity = assertQuantity(item.quantity, "Dispatch quantity", false);
    const shipped = assertQuantity(item.dispatchedQuantity, "Shipped quantity");
    if (shipped > quantity) throw new Error(`Shipped quantity exceeds allocation for ${item.id}.`);
    await client.query(
      `INSERT INTO dispatch_records (id, po, quantity, date, status, remarks)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [requiredString(item.id, "dispatch reference"), item.po, quantity, item.date, item.status, item.remarks ?? ""],
    );
    if (shipped > 0) {
      await client.query(
        `INSERT INTO dispatch_transactions
         (id, idempotency_key, dispatch_id, po, quantity, qc_approved_quantity_used, user_id, user_name, created_at)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7,NOW())`,
        [`MIG-SHIP-${item.id}`, `MIG-SHIP-${item.id}`, item.id, item.po, shipped, context.userId, context.user.name],
      );
    }
  }
  for (const raw of state.activities.slice(0, 12)) {
    const item = raw;
    await client.query(
      `INSERT INTO production_activities (machine, order_po, message, created_at)
       VALUES ($1,$2,$3,$4)`,
      [item.machine, item.order, item.message, item.createdAt],
    );
  }
  await client.query(
    `INSERT INTO audit_log (user_id, username, action, module, reference, details)
     VALUES ($1,$2,'MIGRATE','PRODUCTION','localStorage', $3)`,
    [context.userId, context.user.username, JSON.stringify({ orders: orders.length })],
  );
}

async function upsertOrder(
  client: PoolClient,
  order: Record<string, unknown>,
  context: DatabaseContext,
) {
  const po = requiredString(order.po, "PO number");
  const { rows } = await client.query<{ produced: string }>(
    "SELECT COALESCE(SUM(quantity), 0)::TEXT AS produced FROM production_transactions WHERE po = $1",
    [po],
  );
  const produced = Number(rows[0].produced);
  const target = assertQuantity(order.target, "Order quantity", false);
  const clientProduced = assertQuantity(order.produced, "Production quantity");
  if (clientProduced < produced) throw new Error(`Production history cannot be reduced for ${po}.`);
  if (clientProduced > target) throw new Error(`Production exceeds order quantity for ${po}.`);
  if (order.status === "Completed" && clientProduced < target) {
    throw new Error(`Order ${po} cannot be completed before its target is produced.`);
  }
  const existing = await client.query<{ machine: string }>(
    "SELECT machine FROM production_orders WHERE po = $1",
    [po],
  );
  if (!existing.rowCount && clientProduced > 0) {
    throw new Error("New orders cannot include previously produced quantities.");
  }
  const selectedMachine = requiredString(order.machine, "machine");
  const { rows: masterMachines } = await client.query<{ status: string }>(
    "SELECT status FROM machine_master WHERE machine_name = $1",
    [selectedMachine],
  );
  if (
    !masterMachines[0] ||
    (masterMachines[0].status !== "Active" &&
      (!existing.rowCount || existing.rows[0].machine !== selectedMachine))
  ) {
    throw new Error("Select an active machine for a new assignment.");
  }
  const orderBy = order.orderBy ?? null;
  if (orderBy !== null && orderBy !== "Email" && orderBy !== "WhatsApp") {
    throw new Error("Order By must be Email or WhatsApp.");
  }
  const rate = order.rate ?? null;
  if (
    rate !== null &&
    (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 9_999_999_999.99)
  ) {
    throw new Error("Rate must be a non-negative number.");
  }
  const purchaseDate = optionalOrderDate(order.purchaseDate, "purchase date");
  const dispatchDate = optionalOrderDate(order.dueDate, "dispatch date");
  if (!existing.rowCount && (!orderBy || rate === null || !purchaseDate || !dispatchDate)) {
    throw new Error("Order By, rate, purchase date, and dispatch date are required.");
  }
  if (purchaseDate && dispatchDate && dispatchDate < purchaseDate) {
    throw new Error("Dispatch date cannot be before purchase date.");
  }
  if (existing.rowCount) {
    await client.query("SELECT po FROM production_orders WHERE po = $1 FOR UPDATE", [po]);
  }
  await client.query(
    `INSERT INTO production_orders
     (po, customer, part, material, target, machine, due_date,
      order_by, rate, purchase_date, priority, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (po) DO UPDATE SET
       customer=EXCLUDED.customer, part=EXCLUDED.part, material=EXCLUDED.material,
       target=EXCLUDED.target, machine=EXCLUDED.machine,
       due_date=EXCLUDED.due_date, order_by=EXCLUDED.order_by, rate=EXCLUDED.rate,
       purchase_date=EXCLUDED.purchase_date, priority=EXCLUDED.priority,
       status=EXCLUDED.status,
       updated_at=NOW()
     WHERE (production_orders.customer, production_orders.part, production_orders.material,
            production_orders.target, production_orders.machine,
            production_orders.due_date, production_orders.order_by, production_orders.rate,
            production_orders.purchase_date, production_orders.priority, production_orders.status)
       IS DISTINCT FROM
           (EXCLUDED.customer, EXCLUDED.part, EXCLUDED.material, EXCLUDED.target,
            EXCLUDED.machine, EXCLUDED.due_date,
            EXCLUDED.order_by, EXCLUDED.rate, EXCLUDED.purchase_date,
            EXCLUDED.priority, EXCLUDED.status)`,
    [
      po, requiredString(order.customer, "customer"), requiredString(order.part, "part"),
      requiredString(order.material, "material"), target,
      selectedMachine,
      dispatchDate, orderBy, rate, purchaseDate, order.priority, order.status,
    ],
  );

  const delta = clientProduced - produced;
  if (delta > 0) {
    const { rows: machineRows } = await client.query(
      "SELECT name FROM production_machines WHERE name = $1",
      [order.machine],
    );
    if (!machineRows[0]) throw new Error(`Machine ${String(order.machine)} was not found.`);
    const id = randomUUID();
    await client.query(
      `INSERT INTO production_transactions
       (id, idempotency_key, po, machine, quantity, operator_id, operator_name, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [id, id, po, order.machine, delta, context.userId, context.user.name, order.status],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'PRODUCTION_ENTRY','PRODUCTION',$3,$4)`,
      [context.userId, context.user.username, po, JSON.stringify({ quantity: delta, machine: order.machine })],
    );
  }
}

async function syncMachines(client: PoolClient, machines: State["machines"]) {
  for (const item of machines) {
    await client.query(
      `INSERT INTO production_machines
       (name, brand, status, order_po, part, material, target, downtime)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (name) DO UPDATE SET
         brand=EXCLUDED.brand, status=EXCLUDED.status, order_po=EXCLUDED.order_po,
         part=EXCLUDED.part, material=EXCLUDED.material, target=EXCLUDED.target,
         downtime=EXCLUDED.downtime, updated_at=NOW()
       WHERE (production_machines.brand, production_machines.status, production_machines.order_po,
              production_machines.part, production_machines.material, production_machines.target,
              production_machines.downtime)
         IS DISTINCT FROM
             (EXCLUDED.brand, EXCLUDED.status, EXCLUDED.order_po, EXCLUDED.part,
              EXCLUDED.material, EXCLUDED.target, EXCLUDED.downtime)`,
      [
        requiredString(item.name, "machine"), item.brand, item.status,
        typeof item.order === "string" && item.order ? item.order : null,
        item.part, item.material, assertQuantity(item.target, "Machine target"),
        assertQuantity(item.downtime, "Machine downtime"),
      ],
    );
  }
}

async function syncInspections(client: PoolClient, inspections: State["inspections"], context: DatabaseContext) {
  for (const item of inspections) {
    const inspected = assertQuantity(item.quantityInspected, "Inspected quantity");
    const passed = assertQuantity(item.quantityPassed, "Passed quantity");
    const rejected = assertQuantity(item.quantityRejected, "Rejected quantity");
    if (passed + rejected !== inspected) throw new Error(`QC totals are invalid for ${String(item.id)}.`);
    const previous = await client.query(
      `SELECT po, inspection_date::TEXT AS date, batch, quantity_inspected AS inspected,
              quantity_passed AS passed, quantity_rejected AS rejected, inspector, status,
              remarks, measurements, material_certificate AS "materialCertificate"
       FROM quality_inspections WHERE id = $1`,
      [item.id],
    );
    const details = {
      po: item.po,
      date: item.date,
      batch: item.batch,
      inspected,
      passed,
      rejected,
      inspector: item.inspector,
      status: item.status,
      remarks: item.remarks,
      measurements: Array.isArray(item.measurements) ? item.measurements : [],
      materialCertificate: item.materialCertificate,
    };
    const changed =
      !previous.rows[0] ||
      stable(previous.rows[0]) !== stable(details);
    await client.query(
      `INSERT INTO quality_inspections
       (id, po, inspection_date, batch, quantity_inspected, quantity_passed, quantity_rejected,
        inspector, inspector_id, status, remarks, measurements, material_certificate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         po=EXCLUDED.po, inspection_date=EXCLUDED.inspection_date, batch=EXCLUDED.batch,
         quantity_inspected=EXCLUDED.quantity_inspected, quantity_passed=EXCLUDED.quantity_passed,
         quantity_rejected=EXCLUDED.quantity_rejected, inspector=EXCLUDED.inspector,
         status=EXCLUDED.status, remarks=EXCLUDED.remarks,
         measurements=EXCLUDED.measurements, material_certificate=EXCLUDED.material_certificate,
         updated_at=NOW()
       WHERE (quality_inspections.po, quality_inspections.inspection_date,
              quality_inspections.batch, quality_inspections.quantity_inspected,
              quality_inspections.quantity_passed, quality_inspections.quantity_rejected,
              quality_inspections.inspector, quality_inspections.status,
              quality_inspections.remarks, quality_inspections.measurements,
              quality_inspections.material_certificate)
         IS DISTINCT FROM
             (EXCLUDED.po, EXCLUDED.inspection_date, EXCLUDED.batch,
              EXCLUDED.quantity_inspected, EXCLUDED.quantity_passed,
              EXCLUDED.quantity_rejected, EXCLUDED.inspector, EXCLUDED.status,
              EXCLUDED.remarks, EXCLUDED.measurements, EXCLUDED.material_certificate)`,
      [
        requiredString(item.id, "inspection reference"), item.po, item.date,
        requiredString(item.batch, "inspection batch"), inspected, passed, rejected,
        requiredString(item.inspector, "inspector"), context.userId, item.status,
        typeof item.remarks === "string" ? item.remarks : "",
        JSON.stringify(Array.isArray(item.measurements) ? item.measurements : []),
        item.materialCertificate,
      ],
    );
    if (changed) {
      await client.query(
        `INSERT INTO audit_log (user_id, username, action, module, reference, details)
         VALUES ($1,$2,$3,'INSPECTION',$4,$5)`,
        [
          context.userId,
          context.user.username,
          previous.rows[0] ? "QC_RESULT_UPDATED" : "QC_RESULT",
          String(item.id),
          JSON.stringify({ po: item.po, inspected, passed, rejected }),
        ],
      );
    }
  }
}

async function syncDispatches(client: PoolClient, dispatches: State["dispatches"], context: DatabaseContext) {
  for (const item of dispatches) {
    const quantity = assertQuantity(item.quantity, "Dispatch quantity", false);
    const shipped = assertQuantity(item.dispatchedQuantity, "Shipped quantity");
    if (shipped > quantity) throw new Error(`Shipped quantity exceeds allocation for ${String(item.id)}.`);
    const existing = await client.query<{ po: string; quantity: number; status: string; date: string; remarks: string }>(
      "SELECT po, quantity, status, date::TEXT AS date, remarks FROM dispatch_records WHERE id = $1 FOR UPDATE",
      [item.id],
    );
    const oldShippedResult = await client.query(
      "SELECT COALESCE(SUM(quantity), 0)::INTEGER AS quantity FROM dispatch_transactions WHERE dispatch_id = $1",
      [item.id],
    );
    const oldShipped = Number(oldShippedResult.rows[0].quantity);
    if (existing.rows[0]?.po !== undefined && existing.rows[0].po !== item.po && oldShipped > 0) {
      throw new Error("A dispatch with shipped quantity cannot be reassigned to another order.");
    }
    if (shipped < oldShipped) throw new Error("Dispatch history cannot be reduced.");
    if (shipped > oldShipped && item.status === "CANCELLED") {
      throw new Error("Cancelled dispatches cannot be shipped.");
    }
    if (existing.rows[0]?.status === "CANCELLED" && (
      existing.rows[0].po !== item.po ||
      Number(existing.rows[0].quantity) !== quantity ||
      existing.rows[0].status !== item.status ||
      existing.rows[0].date !== item.date ||
      existing.rows[0].remarks !== (item.remarks ?? "")
    )) {
      throw new Error("Cancelled dispatches cannot be edited.");
    }
    if (existing.rows[0]?.status === "DISPATCHED" && item.status === "CANCELLED") {
      throw new Error("A fully shipped dispatch cannot be cancelled.");
    }
    if (existing.rows[0]?.status === "DISPATCHED" && item.status === "HOLD") {
      throw new Error("A fully shipped dispatch cannot be placed on hold.");
    }
    if (existing.rows[0]?.status === "HOLD" && shipped > oldShipped) {
      throw new Error("Release the dispatch from Hold before shipping.");
    }
    if (item.status !== "CANCELLED" && item.status !== "HOLD") {
      const expectedStatus =
        shipped >= quantity
          ? "DISPATCHED"
          : shipped > 0
            ? "PARTIALLY DISPATCHED"
            : "READY";
      if (item.status !== expectedStatus) {
        throw new Error("Dispatch status does not match its shipped quantity.");
      }
    }
    const dispatchChanged =
      !existing.rows[0] ||
      existing.rows[0].po !== item.po ||
      Number(existing.rows[0].quantity) !== quantity ||
      existing.rows[0].status !== item.status ||
      existing.rows[0].date !== item.date ||
      existing.rows[0].remarks !== (item.remarks ?? "");
    await client.query(
      `INSERT INTO dispatch_records (id, po, quantity, date, status, remarks)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         po=EXCLUDED.po, quantity=EXCLUDED.quantity, date=EXCLUDED.date,
         status=EXCLUDED.status, remarks=EXCLUDED.remarks, updated_at=NOW()
       WHERE (dispatch_records.po, dispatch_records.quantity, dispatch_records.date,
              dispatch_records.status, dispatch_records.remarks)
         IS DISTINCT FROM
             (EXCLUDED.po, EXCLUDED.quantity, EXCLUDED.date, EXCLUDED.status, EXCLUDED.remarks)`,
      [requiredString(item.id, "dispatch reference"), item.po, quantity, item.date, item.status, item.remarks ?? ""],
    );
    if (dispatchChanged) {
      await client.query(
        `INSERT INTO audit_log (user_id, username, action, module, reference, details)
         VALUES ($1,$2,'DISPATCH_RECORD','DISPATCH',$3,$4)`,
        [context.userId, context.user.username, String(item.id), JSON.stringify({ po: item.po, quantity, status: item.status })],
      );
    }
    const delta = shipped - oldShipped;
    if (delta > 0) {
      const { rows: simpleOrderRows } = await client.query<{ quantity: number }>(
        `SELECT quantity
         FROM simple_customer_orders
         WHERE LOWER(po_number) = LOWER($1)
         FOR UPDATE`,
        [item.po],
      );
      if (simpleOrderRows[0]) {
        const { rows: totalRows } = await client.query<{ quantity: number }>(
          `SELECT COALESCE(SUM(quantity), 0)::INTEGER AS quantity
           FROM dispatch_transactions
           WHERE LOWER(po) = LOWER($1)`,
          [item.po],
        );
        if (Number(totalRows[0].quantity) + delta > simpleOrderRows[0].quantity) {
          throw new Error(`Dispatch quantity exceeds the ordered quantity for ${item.po}.`);
        }
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO dispatch_transactions
         (id, idempotency_key, dispatch_id, po, quantity, qc_approved_quantity_used, user_id, user_name)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`,
        [id, id, item.id, item.po, delta, context.userId, context.user.name],
      );
      await client.query(
        `INSERT INTO audit_log (user_id, username, action, module, reference, details)
         VALUES ($1,$2,'DISPATCH','DISPATCH',$3,$4)`,
        [context.userId, context.user.username, String(item.id), JSON.stringify({ po: item.po, quantity: delta })],
      );
    }
  }

  const invalid = await client.query(
    `WITH qc AS (
       SELECT po, SUM(quantity_passed)::BIGINT AS passed
       FROM quality_inspections GROUP BY po
     ), shipped AS (
       SELECT po, SUM(quantity)::BIGINT AS quantity
       FROM dispatch_transactions GROUP BY po
     ), allocated AS (
       SELECT po, SUM(quantity)::BIGINT AS quantity
       FROM dispatch_records WHERE status <> 'CANCELLED' GROUP BY po
     )
     SELECT d.po
     FROM dispatch_records d
     LEFT JOIN qc USING (po)
     LEFT JOIN shipped s USING (po)
     LEFT JOIN allocated a USING (po)
     GROUP BY d.po, qc.passed, s.quantity, a.quantity
     HAVING COALESCE(s.quantity,0) > COALESCE(qc.passed,0)
        OR COALESCE(a.quantity,0) > COALESCE(qc.passed,0)
     LIMIT 1`,
  );
  if (invalid.rows[0]) {
    throw new Error(`Dispatch allocations exceed QC-passed quantity for ${invalid.rows[0].po}.`);
  }
}

async function syncActivities(client: PoolClient, activities: State["activities"]) {
  await client.query("DELETE FROM production_activities");
  for (const item of activities.slice(0, 12)) {
    await client.query(
      `INSERT INTO production_activities (machine, order_po, message, created_at)
       VALUES ($1,$2,$3,$4)`,
      [item.machine, item.order, item.message, item.createdAt],
    );
  }
}

async function auditWipTransitions(
  client: PoolClient,
  before: ProductionWipStageRow[],
  context: DatabaseContext,
) {
  const { rows } = await client.query<ProductionWipStageRow>(
    `SELECT po, part, machine, stage, quantity, status
     FROM production_wip_stages ORDER BY po, stage`,
  );
  const oldStages = new Map(
    before.map((stage) => [`${stage.po}:${stage.stage}`, stage]),
  );
  for (const stage of rows) {
    const previous = oldStages.get(`${stage.po}:${stage.stage}`);
    if (Boolean(previous?.quantity) === Boolean(stage.quantity)) continue;
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'WIP_STAGE_CHANGE','WIP',$3,$4)`,
      [
        context.userId,
        context.user.username,
        stage.po,
        JSON.stringify({
          stage: stage.stage,
          previousStatus: previous?.status ?? "NOT_STARTED",
          status: stage.status,
          quantity: stage.quantity,
        }),
      ],
    );
  }
  for (const previous of before) {
    if (!previous.quantity || rows.some(
      (stage) => stage.po === previous.po && stage.stage === previous.stage,
    )) continue;
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, module, reference, details)
       VALUES ($1,$2,'WIP_STAGE_CHANGE','WIP',$3,$4)`,
      [
        context.userId,
        context.user.username,
        previous.po,
        JSON.stringify({
          stage: previous.stage,
          previousStatus: previous.status,
          status: "CLEARED",
          quantity: 0,
        }),
      ],
    );
  }
}

type ProductionWipStageRow = {
  po: string;
  part: string;
  machine: string;
  stage: string;
  quantity: number;
  status: string;
};

export async function saveProductionSnapshot(input: {
  state: unknown;
  version: number;
  mutationId: string;
  kind: string;
  renames?: Array<{ from: string; to: string }>;
}, context: DatabaseContext) {
  const state = parseState(input.state);
  if (!state) throw new Error("The production state is invalid.");
  if (!canMutate(input.kind, context.user.role)) {
    const error = new Error("You are not authorized to perform this action.");
    Object.assign(error, { status: 403 });
    throw error;
  }
  if (!Number.isInteger(input.version) || input.version < 0) {
    throw new Error("The production state version is invalid.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.mutationId)) {
    throw new Error("The request identifier is invalid.");
  }

  const database = getDatabase();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const replay = await client.query(
      "SELECT resulting_version FROM production_mutations WHERE id = $1",
      [input.mutationId],
    );
    if (replay.rows[0]) {
      const result = await loadState(client);
      await client.query("COMMIT");
      return result;
    }
    const current = await client.query(
      "SELECT version FROM production_state WHERE singleton = TRUE FOR UPDATE",
    );
    const actualVersion = Number(current.rows[0]?.version ?? 0);
    if (actualVersion !== input.version) {
      if (input.kind === "migration") {
        const latest = await loadState(client);
        if (latest.state.orders.length > 0) {
          await client.query("COMMIT");
          return latest;
        }
      }
      const error = new Error("Production data changed elsewhere. Refreshing the latest data; please retry.");
      Object.assign(error, { status: 409 });
      throw error;
    }
    const previous = await loadState(client);
    if (input.kind !== "migration") {
      assertScopedChanges(state, previous.state, input.kind, context.user.role);
    }

    if (input.kind === "migration") {
      if (context.user.role !== "ADMIN") {
        const error = new Error("Only administrators can migrate existing production data.");
        Object.assign(error, { status: 403 });
        throw error;
      }
      await migration(client, state, context);
    } else {
      for (const rename of input.renames ?? []) {
        if (context.user.role !== "ADMIN" || input.kind !== "order") {
          throw new Error("Only administrators can rename production orders.");
        }
        const from = requiredString(rename.from, "previous PO number");
        const to = requiredString(rename.to, "new PO number");
        const renamed = await client.query(
          "UPDATE production_orders SET po = $2, updated_at = NOW() WHERE po = $1",
          [from, to],
        );
        if (!renamed.rowCount) throw new Error(`Order ${from} was not found.`);
        await client.query(
          `INSERT INTO audit_log (user_id, username, action, module, reference, details)
           VALUES ($1,$2,'ORDER_RENAME','ORDERS',$3,$4)`,
          [context.userId, context.user.username, to, JSON.stringify({ previousPo: from })],
        );
      }
      for (const order of state.orders) await upsertOrder(client, order, context);
      await syncMachines(client, state.machines);
      await syncInspections(client, state.inspections, context);
      await syncDispatches(client, state.dispatches, context);

      await syncActivities(client, state.activities);
      if (input.kind !== "machine") {
        await auditWipTransitions(
          client,
          previous.state.wipStages as ProductionWipStageRow[],
          context,
        );
      }

      if (input.kind === "machine") {
        await client.query(
          `INSERT INTO audit_log (user_id, username, action, module, reference, details)
           VALUES ($1,$2,'MACHINE_STATUS','MACHINES','',$3)`,
          [context.userId, context.user.username, JSON.stringify({ version: actualVersion + 1 })],
        );
      }
      if (input.kind === "order") {
        const previousByPo = new Map(previous.state.orders.map((order) => [order.po, order]));
        const renameByTarget = new Map((input.renames ?? []).map((rename) => [rename.to, rename.from]));
        for (const order of state.orders) {
          const prior = previousByPo.get(order.po) ??
            previousByPo.get(renameByTarget.get(String(order.po)) ?? "");
          const action = prior ? "ORDER_EDIT" : "ORDER_CREATE";
          await client.query(
            `INSERT INTO audit_log (user_id, username, action, module, reference, details)
             VALUES ($1,$2,$3,'ORDERS',$4,$5)`,
            [
              context.userId, context.user.username, action, String(order.po),
              JSON.stringify({ status: order.status, target: order.target }),
            ],
          );
        }
      }
    }

    const productionOverage = await client.query(
      `SELECT o.po FROM production_orders o
       LEFT JOIN production_transactions p USING (po)
       GROUP BY o.po, o.target HAVING COALESCE(SUM(p.quantity),0) > o.target LIMIT 1`,
    );
    if (productionOverage.rows[0]) {
      throw new Error(`Production exceeds order quantity for ${productionOverage.rows[0].po}.`);
    }
    const inspectionOverage = await client.query(
      `SELECT i.po FROM quality_inspections i
       LEFT JOIN (SELECT po, COALESCE(SUM(quantity),0) AS produced
                  FROM production_transactions GROUP BY po) p USING (po)
       GROUP BY i.po, p.produced
       HAVING SUM(i.quantity_inspected) > COALESCE(p.produced, 0) LIMIT 1`,
    );
    if (inspectionOverage.rows[0]) {
      throw new Error(`Inspection quantity exceeds production for ${inspectionOverage.rows[0].po}.`);
    }
    const dispatchOverage = await client.query(
      `WITH qc AS (
         SELECT po, SUM(quantity_passed)::BIGINT AS passed
         FROM quality_inspections GROUP BY po
       ), shipped AS (
         SELECT po, SUM(quantity)::BIGINT AS quantity
         FROM dispatch_transactions GROUP BY po
       ), allocated AS (
         SELECT po, SUM(quantity)::BIGINT AS quantity
         FROM dispatch_records WHERE status <> 'CANCELLED' GROUP BY po
       )
       SELECT o.po
       FROM production_orders o
       LEFT JOIN qc USING (po)
       LEFT JOIN shipped s USING (po)
       LEFT JOIN allocated a USING (po)
       WHERE COALESCE(s.quantity,0) > COALESCE(qc.passed,0)
          OR COALESCE(a.quantity,0) > COALESCE(qc.passed,0)
       LIMIT 1`,
    );
    if (dispatchOverage.rows[0]) {
      throw new Error(`Dispatch quantity exceeds QC-passed quantity for ${dispatchOverage.rows[0].po}.`);
    }

    await client.query("UPDATE production_state SET version = version + 1 WHERE singleton = TRUE");
    await client.query(
      "INSERT INTO production_mutations (id, resulting_version) VALUES ($1,$2)",
      [input.mutationId, actualVersion + 1],
    );
    const result = await loadState(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
