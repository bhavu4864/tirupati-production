CREATE TABLE IF NOT EXISTS production_orders (
  po TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  part TEXT NOT NULL,
  material TEXT NOT NULL,
  target INTEGER NOT NULL CHECK (target > 0),
  machine TEXT NOT NULL,
  due_date DATE NOT NULL,
  order_by TEXT CHECK (order_by IN ('Email', 'WhatsApp')),
  rate NUMERIC(12, 2) CHECK (rate >= 0),
  purchase_date DATE,
  priority TEXT NOT NULL CHECK (priority IN ('High', 'Medium', 'Low')),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'In Production', 'Completed', 'On Hold', 'Cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE production_orders
  ADD COLUMN IF NOT EXISTS order_by TEXT,
  ADD COLUMN IF NOT EXISTS rate NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS purchase_date DATE;

DO $$
BEGIN
  ALTER TABLE production_orders
    ADD CONSTRAINT production_orders_order_by_check
    CHECK (order_by IS NULL OR order_by IN ('Email', 'WhatsApp'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE production_orders
    ADD CONSTRAINT production_orders_rate_check
    CHECK (rate IS NULL OR rate >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS production_machines (
  name TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'IDLE', 'STOPPED', 'PAUSED', 'MAINTENANCE')),
  order_po TEXT REFERENCES production_orders(po) ON UPDATE CASCADE ON DELETE SET NULL,
  part TEXT NOT NULL,
  material TEXT NOT NULL,
  target INTEGER NOT NULL DEFAULT 0 CHECK (target >= 0),
  downtime INTEGER NOT NULL DEFAULT 0 CHECK (downtime >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS machine_master (
  id TEXT PRIMARY KEY,
  machine_name TEXT NOT NULL,
  machine_code TEXT NOT NULL,
  machine_type TEXT NOT NULL CHECK (
    machine_type IN ('CNC', 'Manual', 'Drilling', 'Milling', 'Power Press', 'Special Machine', 'Other')
  ),
  status TEXT NOT NULL CHECK (status IN ('Active', 'Inactive')),
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS machine_master_name_lower_unique
  ON machine_master (LOWER(machine_name));
CREATE UNIQUE INDEX IF NOT EXISTS machine_master_code_lower_unique
  ON machine_master (LOWER(machine_code));

WITH legacy_names AS (
  SELECT name AS machine_name, 0 AS source_order FROM production_machines
  UNION ALL
  SELECT machine AS machine_name, 1 AS source_order FROM production_orders
), distinct_legacy_names AS (
  SELECT DISTINCT ON (LOWER(machine_name)) machine_name
  FROM legacy_names
  WHERE machine_name IS NOT NULL AND BTRIM(machine_name) <> ''
  ORDER BY LOWER(machine_name), source_order
)
INSERT INTO machine_master
  (id, machine_name, machine_code, machine_type, status, location, notes)
SELECT
  'legacy-' || encode(convert_to(m.machine_name, 'UTF8'), 'hex'),
  m.machine_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM machine_master existing
    WHERE LOWER(existing.machine_code) = LOWER(m.machine_name)
  ) THEN 'LEGACY-' || md5(LOWER(m.machine_name))
    ELSE m.machine_name
  END,
  CASE WHEN UPPER(m.machine_name) LIKE 'CNC%' THEN 'CNC' ELSE 'Other' END,
  'Active',
  '',
  'Migrated from existing production data.'
FROM distinct_legacy_names m
WHERE NOT EXISTS (
  SELECT 1 FROM machine_master existing
  WHERE LOWER(existing.machine_name) = LOWER(m.machine_name)
)
ON CONFLICT DO NOTHING;

INSERT INTO machine_master
  (id, machine_name, machine_code, machine_type, status, location, notes)
VALUES
  ('default-machine-1', 'Machine 1', 'MACHINE-1', 'Other', 'Active', '', ''),
  ('default-machine-2', 'Machine 2', 'MACHINE-2', 'Other', 'Active', '', ''),
  ('default-machine-3', 'Machine 3', 'MACHINE-3', 'Other', 'Active', '', '')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS simple_customer_orders (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  po_number TEXT NOT NULL,
  order_by TEXT NOT NULL CHECK (order_by IN ('Email', 'WhatsApp')),
  item_name TEXT NOT NULL,
  material TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  rate NUMERIC(12, 2) NOT NULL CHECK (rate >= 0),
  purchase_date DATE NOT NULL,
  due_date DATE NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('Normal', 'High', 'Urgent')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (
    status IN ('Pending', 'Processing', 'Packing', 'Partial Delivery', 'Fully Dispatched')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_date >= purchase_date)
);

ALTER TABLE simple_customer_orders
  DROP CONSTRAINT IF EXISTS simple_customer_orders_status_check;

ALTER TABLE simple_customer_orders
  ALTER COLUMN status SET DEFAULT 'Pending';

UPDATE simple_customer_orders
SET status = CASE status
  WHEN 'Running' THEN 'Processing'
  WHEN 'Ready in Stock' THEN 'Packing'
  WHEN 'Raw Material Required' THEN 'Pending'
  ELSE status
END
WHERE status IN ('Running', 'Ready in Stock', 'Raw Material Required');

ALTER TABLE simple_customer_orders
  ADD CONSTRAINT simple_customer_orders_status_check
  CHECK (status IN ('Pending', 'Processing', 'Packing', 'Partial Delivery', 'Fully Dispatched'));

CREATE UNIQUE INDEX IF NOT EXISTS simple_customer_orders_po_lower_unique
  ON simple_customer_orders (LOWER(po_number));

INSERT INTO simple_customer_orders
  (id, company_name, po_number, order_by, item_name, material, quantity, rate,
   purchase_date, due_date, priority, status, created_at, updated_at)
SELECT
  'legacy-order-' || encode(convert_to(o.po, 'UTF8'), 'hex'),
  o.customer,
  o.po,
  COALESCE(o.order_by, 'Email'),
  o.part,
  o.material,
  o.target,
  COALESCE(o.rate, 0),
  COALESCE(o.purchase_date, o.created_at::DATE),
  GREATEST(o.due_date, COALESCE(o.purchase_date, o.created_at::DATE)),
  CASE o.priority WHEN 'High' THEN 'High' ELSE 'Normal' END,
  CASE o.status
    WHEN 'In Production' THEN 'Processing'
    WHEN 'Completed' THEN 'Packing'
    ELSE 'Pending'
  END,
  o.created_at,
  o.updated_at
FROM production_orders o
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS machine_daily_records (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machine_master(id) ON DELETE RESTRICT,
  machine_name TEXT NOT NULL,
  production_date DATE NOT NULL,
  part_no TEXT NOT NULL,
  morning_pcs INTEGER NOT NULL DEFAULT 0 CHECK (morning_pcs >= 0),
  evening_pcs INTEGER NOT NULL DEFAULT 0 CHECK (evening_pcs >= 0),
  operator_name TEXT NOT NULL,
  breakdown TEXT NOT NULL CHECK (breakdown IN ('Yes', 'No')),
  breakdown_reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (breakdown = 'Yes' AND BTRIM(breakdown_reason) <> '')
    OR (breakdown = 'No' AND breakdown_reason = '')
  )
);

ALTER TABLE machine_daily_records
  ADD COLUMN IF NOT EXISTS morning_pcs INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evening_pcs INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE machine_daily_records
    ADD CONSTRAINT machine_daily_records_morning_pcs_check CHECK (morning_pcs >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE machine_daily_records
    ADD CONSTRAINT machine_daily_records_evening_pcs_check CHECK (evening_pcs >= 0);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'machine_daily_records'
      AND column_name = 'pcs'
  ) THEN
    EXECUTE
      'UPDATE machine_daily_records
       SET morning_pcs = pcs
       WHERE morning_pcs = 0 AND evening_pcs = 0 AND pcs > 0';
  END IF;
END $$;

ALTER TABLE machine_daily_records
  DROP COLUMN IF EXISTS time_hours,
  DROP COLUMN IF EXISTS pcs;

CREATE INDEX IF NOT EXISTS machine_daily_records_machine_date_idx
  ON machine_daily_records (machine_id, production_date DESC, created_at DESC);

DROP VIEW IF EXISTS production_order_balances;
ALTER TABLE production_orders DROP COLUMN IF EXISTS cycle_time;
ALTER TABLE production_machines DROP COLUMN IF EXISTS cycle_time;

CREATE TABLE IF NOT EXISTS production_transactions (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  po TEXT NOT NULL REFERENCES production_orders(po) ON UPDATE CASCADE,
  machine TEXT NOT NULL REFERENCES production_machines(name),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  operator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  operator_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'In Production', 'Completed', 'On Hold', 'Cancelled', 'MIGRATED')),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS production_transactions_po_idx
  ON production_transactions (po, created_at);

CREATE TABLE IF NOT EXISTS quality_inspections (
  id TEXT PRIMARY KEY,
  po TEXT NOT NULL REFERENCES production_orders(po) ON UPDATE CASCADE,
  inspection_date DATE NOT NULL,
  batch TEXT NOT NULL,
  quantity_inspected INTEGER NOT NULL CHECK (quantity_inspected >= 0),
  quantity_passed INTEGER NOT NULL CHECK (quantity_passed >= 0),
  quantity_rejected INTEGER NOT NULL CHECK (quantity_rejected >= 0),
  inspector TEXT NOT NULL,
  inspector_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'In Inspection', 'Passed', 'Failed', 'Hold')),
  remarks TEXT NOT NULL DEFAULT '',
  measurements JSONB NOT NULL DEFAULT '[]'::jsonb,
  material_certificate TEXT NOT NULL CHECK (material_certificate IN ('Verified', 'Pending', 'Missing')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (quantity_passed + quantity_rejected = quantity_inspected)
);

CREATE INDEX IF NOT EXISTS quality_inspections_po_idx
  ON quality_inspections (po, inspection_date);

CREATE TABLE IF NOT EXISTS dispatch_records (
  id TEXT PRIMARY KEY,
  po TEXT NOT NULL REFERENCES production_orders(po) ON UPDATE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('READY', 'PARTIALLY DISPATCHED', 'DISPATCHED', 'HOLD', 'CANCELLED')),
  remarks TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dispatch_records_po_idx ON dispatch_records (po);

CREATE TABLE IF NOT EXISTS dispatch_transactions (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  dispatch_id TEXT NOT NULL REFERENCES dispatch_records(id),
  po TEXT NOT NULL REFERENCES production_orders(po) ON UPDATE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  qc_approved_quantity_used INTEGER NOT NULL CHECK (qc_approved_quantity_used > 0),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (qc_approved_quantity_used = quantity)
);

CREATE INDEX IF NOT EXISTS dispatch_transactions_po_idx
  ON dispatch_transactions (po, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS production_orders_po_lower_unique
  ON production_orders (LOWER(po));

CREATE TABLE IF NOT EXISTS production_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  version BIGINT NOT NULL DEFAULT 0
);

INSERT INTO production_state (singleton, version)
VALUES (TRUE, 0)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS production_mutations (
  id TEXT PRIMARY KEY,
  resulting_version BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_activities (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  machine TEXT NOT NULL,
  order_po TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS database_backups (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  size_bytes BIGINT NOT NULL,
  backup_data JSONB NOT NULL
);

CREATE OR REPLACE VIEW production_wip_stages AS
WITH produced AS (
  SELECT po, SUM(quantity)::BIGINT AS quantity, MAX(created_at) AS updated_at
  FROM production_transactions
  GROUP BY po
),
inspected AS (
  SELECT po, SUM(quantity_inspected)::BIGINT AS quantity, MAX(updated_at) AS updated_at
  FROM quality_inspections
  GROUP BY po
),
passed AS (
  SELECT po, SUM(quantity_passed)::BIGINT AS quantity, MAX(updated_at) AS updated_at
  FROM quality_inspections
  GROUP BY po
),
shipped AS (
  SELECT po, SUM(quantity)::BIGINT AS quantity
  FROM dispatch_transactions
  GROUP BY po
)
SELECT o.po, o.part, o.machine, 'AWAITING_INSPECTION'::TEXT AS stage,
       GREATEST(0, COALESCE(p.quantity, 0) - COALESCE(i.quantity, 0))::INTEGER AS quantity,
       'IN_PROCESS'::TEXT AS status, p.updated_at
FROM production_orders o
LEFT JOIN produced p USING (po)
LEFT JOIN inspected i USING (po)
WHERE o.status <> 'Cancelled'
UNION ALL
SELECT o.po, o.part, o.machine, 'QC_PASSED_AWAITING_DISPATCH'::TEXT,
       GREATEST(0, COALESCE(q.quantity, 0) - COALESCE(s.quantity, 0))::INTEGER,
       'READY_TO_DISPATCH'::TEXT, q.updated_at
FROM production_orders o
LEFT JOIN passed q USING (po)
LEFT JOIN shipped s USING (po)
WHERE o.status <> 'Cancelled'
UNION ALL
SELECT o.po, o.part, o.machine, 'QC_REJECTED'::TEXT,
       COALESCE(SUM(i.quantity_rejected), 0)::INTEGER,
       'BLOCKED'::TEXT, MAX(i.updated_at)
FROM production_orders o
LEFT JOIN quality_inspections i USING (po)
WHERE o.status <> 'Cancelled'
GROUP BY o.po, o.part, o.machine;

CREATE VIEW production_order_balances AS
WITH production AS (
  SELECT po, SUM(quantity)::BIGINT AS produced
  FROM production_transactions GROUP BY po
),
quality AS (
  SELECT po, SUM(quantity_inspected)::BIGINT AS inspected,
         SUM(quantity_passed)::BIGINT AS passed,
         SUM(quantity_rejected)::BIGINT AS rejected
  FROM quality_inspections GROUP BY po
),
dispatch AS (
  SELECT po, SUM(quantity)::BIGINT AS dispatched
  FROM dispatch_transactions GROUP BY po
),
wip AS (
  SELECT po, SUM(quantity)::BIGINT AS quantity
  FROM production_wip_stages GROUP BY po
)
SELECT o.po, o.customer, o.part, o.material, o.target,
       COALESCE(p.produced, 0)::INTEGER AS produced,
       COALESCE(w.quantity, 0)::INTEGER AS "wipQuantity",
       COALESCE(q.passed, 0)::INTEGER AS "qcPassedQuantity",
       COALESCE(q.rejected, 0)::INTEGER AS "qcRejectedQuantity",
       COALESCE(d.dispatched, 0)::INTEGER AS "dispatchQuantity",
       GREATEST(0, o.target - COALESCE(p.produced, 0))::INTEGER AS "remainingQuantity",
       o.machine, o.due_date::TEXT AS "dueDate",
       o.priority, o.status, o.created_at AS "createdAt", o.updated_at AS "updatedAt",
       o.order_by AS "orderBy", o.rate::DOUBLE PRECISION AS rate,
       o.purchase_date::TEXT AS "purchaseDate"
FROM production_orders o
LEFT JOIN production p USING (po)
LEFT JOIN quality q USING (po)
LEFT JOIN dispatch d USING (po)
LEFT JOIN wip w USING (po);
