"use client";

import { useEffect, useSyncExternalStore } from "react";

export type MachineStatus =
  | "RUNNING"
  | "IDLE"
  | "STOPPED"
  | "PAUSED"
  | "MAINTENANCE";

export type OrderStatus =
  | "Pending"
  | "In Production"
  | "Completed"
  | "On Hold"
  | "Cancelled";

export type OrderPriority = "High" | "Medium" | "Low";
export type OrderChannel = "Email" | "WhatsApp";

export type ProductionOrder = {
  po: string;
  customer: string;
  part: string;
  material: string;
  target: number;
  produced: number;
  machine: string;
  dueDate: string;
  orderBy?: OrderChannel | null;
  rate?: number | null;
  purchaseDate?: string | null;
  priority: OrderPriority;
  status: OrderStatus;
  wipQuantity?: number;
  qcPassedQuantity?: number;
  qcRejectedQuantity?: number;
  dispatchQuantity?: number;
  remainingQuantity?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductionOrderInput = Omit<ProductionOrder, "produced" | "status">;

export type InspectionStatus =
  | "Pending"
  | "In Inspection"
  | "Passed"
  | "Failed"
  | "Hold";

export type MeasurementResult = "PASS" | "FAIL";

export type QualityMeasurement = {
  key: string;
  label: string;
  nominal: string;
  actual: string;
  tolerance: string;
  result: MeasurementResult;
};

export type InspectionRecord = {
  id: string;
  date: string;
  po: string;
  customer: string;
  part: string;
  material: string;
  machine: string;
  batch: string;
  quantityProduced: number;
  quantityInspected: number;
  quantityPassed: number;
  quantityRejected: number;
  inspector: string;
  status: InspectionStatus;
  remarks: string;
  measurements: QualityMeasurement[];
  materialCertificate: "Verified" | "Pending" | "Missing";
};

export type InspectionInput = Omit<
  InspectionRecord,
  "id" | "quantityProduced"
>;

export type DispatchStatus =
  | "READY"
  | "PARTIALLY DISPATCHED"
  | "DISPATCHED"
  | "HOLD"
  | "CANCELLED";

export type DispatchRecord = {
  id: string;
  po: string;
  quantity: number;
  dispatchedQuantity: number;
  date: string;
  status: DispatchStatus;
  remarks: string;
};

export type DispatchInput = Omit<
  DispatchRecord,
  "id" | "dispatchedQuantity" | "status"
>;

export type ProductionMachine = {
  name: string;
  brand: string;
  status: MachineStatus;
  order: string;
  part: string;
  material: string;
  target: number;
  produced: number;
  downtime: number;
};

export type ProductionActivity = {
  id: number;
  machine: string;
  order: string;
  message: string;
  createdAt: number;
};

export type ProductionWipStage = {
  po: string;
  part: string;
  machine: string;
  stage: "AWAITING_INSPECTION" | "QC_PASSED_AWAITING_DISPATCH" | "QC_REJECTED";
  quantity: number;
  status: "IN_PROCESS" | "READY_TO_DISPATCH" | "BLOCKED";
  updatedAt: string | null;
};

export type ProductionSummary = {
  totalTarget: number;
  totalProduced: number;
  totalDispatched: number;
  remainingProduction: number;
  activeMachines: number;
  idleMachines: number;
  machineCount: number;
  machineUtilization: number;
  totalWip: number;
  ordersInProgress: number;
  totalInspected: number;
  totalPassed: number;
  totalRejected: number;
  pendingInspection: number;
  dispatchedToday: number;
};

const initialMachines: ProductionMachine[] = [
  {
    name: "CNC-1",
    brand: "LMW",
    status: "RUNNING",
    order: "PO-1025",
    part: "Split Nut",
    material: "Brass",
    target: 2000,
    produced: 850,
    downtime: 25,
  },
  {
    name: "CNC-2",
    brand: "Jyoti CNC",
    status: "IDLE",
    order: "PO-1026",
    part: "Yoke",
    material: "Aluminium Bronze",
    target: 1500,
    produced: 0,
    downtime: 0,
  },
  {
    name: "CNC-3",
    brand: "Jyoti CNC",
    status: "RUNNING",
    order: "PO-1027",
    part: "Seat Ring",
    material: "C95400",
    target: 1000,
    produced: 620,
    downtime: 12,
  },
];

const initialOrders: ProductionOrder[] = [
  {
    po: "PO-1025",
    customer: "Forbes Marshall",
    part: "Split Nut",
    material: "Brass",
    target: 2000,
    produced: 850,
    machine: "CNC-1",
    dueDate: "2026-10-08",
    priority: "High",
    status: "In Production",
  },
  {
    po: "PO-1026",
    customer: "Inoxpa India",
    part: "Yoke",
    material: "Aluminium Bronze",
    target: 1500,
    produced: 0,
    machine: "CNC-2",
    dueDate: "2026-10-10",
    priority: "Medium",
    status: "Pending",
  },
  {
    po: "PO-1027",
    customer: "Horbiger India",
    part: "Seat Ring",
    material: "C95400",
    target: 1000,
    produced: 620,
    machine: "CNC-3",
    dueDate: "2026-10-07",
    priority: "High",
    status: "In Production",
  },
];

const initialInspections: InspectionRecord[] = [
  {
    id: "INSP-2026-001",
    date: "2026-10-06",
    po: "PO-1025",
    customer: "Forbes Marshall",
    part: "Split Nut",
    material: "Brass",
    machine: "CNC-1",
    batch: "SN-261006-A",
    quantityProduced: 850,
    quantityInspected: 200,
    quantityPassed: 198,
    quantityRejected: 2,
    inspector: "R. Patel",
    status: "Failed",
    remarks: "Two pieces held for thread pitch recheck.",
    measurements: [
      { key: "od", label: "OD", nominal: "32.00 mm", actual: "32.01 mm", tolerance: "±0.05 mm", result: "PASS" },
      { key: "id", label: "ID", nominal: "18.00 mm", actual: "18.02 mm", tolerance: "±0.05 mm", result: "PASS" },
      { key: "length", label: "Overall Length", nominal: "24.00 mm", actual: "24.01 mm", tolerance: "±0.10 mm", result: "PASS" },
      { key: "thread", label: "Thread", nominal: "M18 × 1.5", actual: "M18 × 1.5", tolerance: "6H fit", result: "FAIL" },
      { key: "critical", label: "Critical dimension", nominal: "6.00 mm", actual: "6.01 mm", tolerance: "±0.03 mm", result: "PASS" },
      { key: "surface", label: "Surface / visual", nominal: "No burrs", actual: "Minor burrs on 2 pcs", tolerance: "Visual standard", result: "FAIL" },
      { key: "certificate", label: "Material certificate", nominal: "Required", actual: "Verified", tolerance: "Heat traceable", result: "PASS" },
    ],
    materialCertificate: "Verified",
  },
  {
    id: "INSP-2026-002",
    date: "2026-10-06",
    po: "PO-1026",
    customer: "Inoxpa India",
    part: "Yoke",
    material: "Aluminium Bronze",
    machine: "CNC-2",
    batch: "YK-261006-A",
    quantityProduced: 0,
    quantityInspected: 0,
    quantityPassed: 0,
    quantityRejected: 0,
    inspector: "S. Joshi",
    status: "Pending",
    remarks: "Awaiting first-off production sample.",
    measurements: [
      { key: "od", label: "OD", nominal: "48.00 mm", actual: "—", tolerance: "±0.05 mm", result: "PASS" },
      { key: "id", label: "ID", nominal: "22.00 mm", actual: "—", tolerance: "±0.05 mm", result: "PASS" },
      { key: "length", label: "Overall Length", nominal: "36.00 mm", actual: "—", tolerance: "±0.10 mm", result: "PASS" },
      { key: "thread", label: "Thread", nominal: "M22 × 1.5", actual: "—", tolerance: "6H fit", result: "PASS" },
      { key: "critical", label: "Critical dimension", nominal: "12.00 mm", actual: "—", tolerance: "±0.03 mm", result: "PASS" },
      { key: "surface", label: "Surface / visual", nominal: "No cracks", actual: "Pending sample", tolerance: "Visual standard", result: "PASS" },
      { key: "certificate", label: "Material certificate", nominal: "Required", actual: "Awaiting document", tolerance: "Heat traceable", result: "PASS" },
    ],
    materialCertificate: "Pending",
  },
  {
    id: "INSP-2026-003",
    date: "2026-10-06",
    po: "PO-1027",
    customer: "Horbiger India",
    part: "Seat Ring",
    material: "C95400",
    machine: "CNC-3",
    batch: "SR-261006-A",
    quantityProduced: 620,
    quantityInspected: 180,
    quantityPassed: 180,
    quantityRejected: 0,
    inspector: "M. Vyas",
    status: "In Inspection",
    remarks: "First-off and in-process samples within limits.",
    measurements: [
      { key: "od", label: "OD", nominal: "64.00 mm", actual: "64.01 mm", tolerance: "±0.05 mm", result: "PASS" },
      { key: "id", label: "ID", nominal: "42.00 mm", actual: "42.00 mm", tolerance: "±0.04 mm", result: "PASS" },
      { key: "length", label: "Overall Length", nominal: "16.00 mm", actual: "16.01 mm", tolerance: "±0.10 mm", result: "PASS" },
      { key: "thread", label: "Thread", nominal: "N/A", actual: "N/A", tolerance: "Drawing spec", result: "PASS" },
      { key: "critical", label: "Critical dimension", nominal: "4.50 mm", actual: "4.49 mm", tolerance: "±0.03 mm", result: "PASS" },
      { key: "surface", label: "Surface / visual", nominal: "No porosity", actual: "Acceptable", tolerance: "Visual standard", result: "PASS" },
      { key: "certificate", label: "Material certificate", nominal: "Required", actual: "Verified", tolerance: "Heat traceable", result: "PASS" },
    ],
    materialCertificate: "Verified",
  },
];

const initialDispatches: DispatchRecord[] = [
  {
    id: "DSP-2026-001",
    po: "PO-1025",
    quantity: 100,
    dispatchedQuantity: 50,
    date: "2026-10-06",
    status: "PARTIALLY DISPATCHED",
    remarks: "First lot dispatched after final QC release.",
  },
];

const storageKey = "tirupati-production-store-v1";

let machines = initialMachines;
let orders = initialOrders;
let inspections = initialInspections;
let dispatches = initialDispatches;
let nextActivityId = 4;
let nextInspectionSequence = 4;
let nextDispatchSequence = 2;
let activities: ProductionActivity[] = initialMachines.map((machine, index) => ({
  id: index + 1,
  machine: machine.name,
  order: machine.order,
  message: `Shift production started at ${machine.produced.toLocaleString()} pcs`,
  createdAt: 0,
}));
let wipStages: ProductionWipStage[] = [];
let productionSummary: ProductionSummary = {
  totalTarget: 0,
  totalProduced: 0,
  totalDispatched: 0,
  remainingProduction: 0,
  activeMachines: 0,
  idleMachines: 0,
  machineCount: 0,
  machineUtilization: 0,
  totalWip: 0,
  ordersInProgress: 0,
  totalInspected: 0,
  totalPassed: 0,
  totalRejected: 0,
  pendingInspection: 0,
  dispatchedToday: 0,
};
const listeners = new Set<() => void>();
let storageHydrated = false;
let persistedVersion = 0;
let dataHydrated = false;
let hydrationRequest: Promise<void> | null = null;
let mutationPending = false;
let lastPersistedState: ReturnType<typeof stateSnapshot> | null = null;
let lastPersistedSummary = productionSummary;

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isStoredState(value: unknown): value is {
  machines: ProductionMachine[];
  orders: ProductionOrder[];
  inspections: InspectionRecord[];
  dispatches: DispatchRecord[];
  activities: ProductionActivity[];
  nextActivityId: number;
  nextInspectionSequence: number;
  nextDispatchSequence: number;
} {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  const machineStatuses: MachineStatus[] = [
    "RUNNING", "IDLE", "STOPPED", "PAUSED", "MAINTENANCE",
  ];
  const orderStatuses: OrderStatus[] = [
    "Pending", "In Production", "Completed", "On Hold", "Cancelled",
  ];
  const inspectionStatuses: InspectionStatus[] = [
    "Pending", "In Inspection", "Passed", "Failed", "Hold",
  ];
  const dispatchStatuses: DispatchStatus[] = [
    "READY", "PARTIALLY DISPATCHED", "DISPATCHED", "HOLD", "CANCELLED",
  ];

  return (
    Array.isArray(state.machines) &&
    state.machines.every((machine: ProductionMachine) =>
      typeof machine.name === "string" &&
      typeof machine.brand === "string" &&
      machineStatuses.includes(machine.status) &&
      typeof machine.order === "string" &&
      typeof machine.part === "string" &&
      typeof machine.material === "string" &&
      isNonNegativeInteger(machine.target) &&
      isNonNegativeInteger(machine.produced) &&
      machine.produced <= machine.target &&
      isNonNegativeInteger(machine.downtime),
    ) &&
    Array.isArray(state.orders) &&
    state.orders.every((order: ProductionOrder) =>
      typeof order.po === "string" &&
      typeof order.customer === "string" &&
      typeof order.part === "string" &&
      typeof order.material === "string" &&
      isNonNegativeInteger(order.target) &&
      isNonNegativeInteger(order.produced) &&
      order.produced <= order.target &&
      typeof order.machine === "string" &&
      typeof order.dueDate === "string" &&
      ["High", "Medium", "Low"].includes(order.priority) &&
      orderStatuses.includes(order.status),
    ) &&
    Array.isArray(state.inspections) &&
    state.inspections.every((inspection: InspectionRecord) =>
      typeof inspection.id === "string" &&
      typeof inspection.date === "string" &&
      typeof inspection.po === "string" &&
      typeof inspection.customer === "string" &&
      typeof inspection.part === "string" &&
      typeof inspection.material === "string" &&
      typeof inspection.machine === "string" &&
      typeof inspection.batch === "string" &&
      isNonNegativeInteger(inspection.quantityProduced) &&
      isNonNegativeInteger(inspection.quantityInspected) &&
      isNonNegativeInteger(inspection.quantityPassed) &&
      isNonNegativeInteger(inspection.quantityRejected) &&
      inspection.quantityPassed + inspection.quantityRejected === inspection.quantityInspected &&
      typeof inspection.inspector === "string" &&
      inspectionStatuses.includes(inspection.status) &&
      Array.isArray(inspection.measurements) &&
      ["Verified", "Pending", "Missing"].includes(inspection.materialCertificate),
    ) &&
    Array.isArray(state.dispatches) &&
    state.dispatches.every((dispatch: DispatchRecord) =>
      typeof dispatch.id === "string" &&
      typeof dispatch.po === "string" &&
      isNonNegativeInteger(dispatch.quantity) &&
      isNonNegativeInteger(dispatch.dispatchedQuantity) &&
      dispatch.dispatchedQuantity <= dispatch.quantity &&
      typeof dispatch.date === "string" &&
      dispatchStatuses.includes(dispatch.status),
    ) &&
    Array.isArray(state.activities) &&
    state.activities.every((activity: ProductionActivity) =>
      isNonNegativeInteger(activity.id) &&
      typeof activity.machine === "string" &&
      typeof activity.order === "string" &&
      typeof activity.message === "string" &&
      isNonNegativeInteger(activity.createdAt),
    ) &&
    isNonNegativeInteger(state.nextActivityId) &&
    isNonNegativeInteger(state.nextInspectionSequence) &&
    isNonNegativeInteger(state.nextDispatchSequence)
  );
}

function replaceStore(state: {
  machines: ProductionMachine[];
  orders: ProductionOrder[];
  inspections: InspectionRecord[];
  dispatches: DispatchRecord[];
  activities: ProductionActivity[];
  wipStages?: ProductionWipStage[];
}, summary?: ProductionSummary) {
  machines = state.machines;
  orders = state.orders;
  inspections = state.inspections;
  dispatches = state.dispatches;
  activities = state.activities;
  wipStages = state.wipStages ?? [];
  if (summary) productionSummary = summary;
  nextActivityId = Math.max(0, ...activities.map((activity) => activity.id + 1));
  nextInspectionSequence = Math.max(
    1,
    ...inspections.map((inspection) => Number(inspection.id.match(/-(\d+)$/)?.[1] ?? 0) + 1),
  );
  nextDispatchSequence = Math.max(
    1,
    ...dispatches.map((dispatch) => Number(dispatch.id.match(/-(\d+)$/)?.[1] ?? 0) + 1),
  );
}

async function fetchSnapshot() {
  const response = await fetch("/api/production-data", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load production data (${response.status}).`);
  }
  return response.json() as Promise<{
    version: number;
    state: {
      machines: ProductionMachine[];
      orders: ProductionOrder[];
      inspections: InspectionRecord[];
      dispatches: DispatchRecord[];
      activities: ProductionActivity[];
      wipStages: ProductionWipStage[];
    };
    summary: ProductionSummary;
  }>;
}

function stateSnapshot() {
  return { machines, orders, inspections, dispatches, activities };
}

async function hydrateStore() {
  if (storageHydrated || typeof window === "undefined") return;
  storageHydrated = true;
  try {
    const stored = window.localStorage.getItem(storageKey);
    let localState: ReturnType<typeof stateSnapshot> & {
      nextActivityId: number;
      nextInspectionSequence: number;
      nextDispatchSequence: number;
    } | null = null;
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (!isStoredState(parsed)) {
        throw new Error("Saved production data is invalid; migration was not attempted.");
      }
      localState = parsed;
      nextActivityId = parsed.nextActivityId;
      nextInspectionSequence = parsed.nextInspectionSequence;
      nextDispatchSequence = parsed.nextDispatchSequence;
    }

    const current = await fetchSnapshot();
    persistedVersion = current.version;
    if (current.state.orders.length === 0) {
      const initialState = localState ?? {
        machines: initialMachines,
        orders: initialOrders,
        inspections: initialInspections,
        dispatches: initialDispatches,
        activities,
      };
      const migration = await fetch("/api/production-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: initialState,
          version: persistedVersion,
          mutationId: crypto.randomUUID(),
          kind: "migration",
        }),
      });
      if (!migration.ok) {
        const result = await migration.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? "Existing production data could not be migrated.");
      }
      const migrated = await migration.json() as typeof current;
      persistedVersion = migrated.version;
      replaceStore(migrated.state, migrated.summary);
      lastPersistedState = stateSnapshot();
      lastPersistedSummary = migrated.summary;
      window.localStorage.removeItem(storageKey);
    } else {
      replaceStore(current.state, current.summary);
      lastPersistedState = stateSnapshot();
      lastPersistedSummary = current.summary;
    }
    dataHydrated = true;
    listeners.forEach((listener) => listener());
  } catch (error) {
    console.error("Unable to load saved production data.", error);
    storageHydrated = false;
    hydrationRequest = null;
  }
}

async function notify(
  kind: string,
  renames?: Array<{ from: string; to: string }>,
): Promise<{ success: boolean; error?: string }> {
  if (!dataHydrated || typeof window === "undefined") {
    return { success: false, error: "Production data is still loading. Please retry." };
  }
  if (mutationPending) {
    return { success: false, error: "Another update is being saved. Please retry." };
  }
  mutationPending = true;
  try {
    const response = await fetch("/api/production-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: stateSnapshot(),
        version: persistedVersion,
        mutationId: crypto.randomUUID(),
        kind,
        renames,
      }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      try {
        const latest = await fetchSnapshot();
        persistedVersion = latest.version;
        replaceStore(latest.state, latest.summary);
        lastPersistedState = stateSnapshot();
        lastPersistedSummary = latest.summary;
        listeners.forEach((listener) => listener());
      } catch (refreshError) {
        console.error("Unable to refresh production data after a rejected update.", refreshError);
        if (lastPersistedState) {
          replaceStore(lastPersistedState, lastPersistedSummary);
        }
        listeners.forEach((listener) => listener());
      }
      return { success: false, error: result?.error ?? "Production data could not be saved." };
    }
    const snapshot = await response.json() as {
      version: number;
      state: ReturnType<typeof stateSnapshot> & { wipStages: ProductionWipStage[] };
      summary: ProductionSummary;
    };
    persistedVersion = snapshot.version;
    replaceStore(snapshot.state, snapshot.summary);
    lastPersistedState = stateSnapshot();
    lastPersistedSummary = snapshot.summary;
    listeners.forEach((listener) => listener());
    return { success: true };
  } catch (error) {
    console.error("Unable to persist production data.", error);
    if (lastPersistedState) {
      replaceStore(lastPersistedState, lastPersistedSummary);
    }
    listeners.forEach((listener) => listener());
    return { success: false, error: "Unable to save changes to the database." };
  } finally {
    mutationPending = false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getMachines() {
  return machines;
}

function getOrders() {
  return orders;
}

function getInspections() {
  return inspections;
}

function getDispatches() {
  return dispatches;
}

function recordActivity(machine: ProductionMachine, message: string) {
  activities = [
    {
      id: nextActivityId++,
      machine: machine.name,
      order: machine.order,
      message,
      createdAt: Date.now(),
    },
    ...activities,
  ].slice(0, 12);
}

export function useProductionMachines() {
  useEffect(() => {
    if (!hydrationRequest) hydrationRequest = hydrateStore();
  }, []);
  return useSyncExternalStore(subscribe, getMachines, () => initialMachines);
}

export function useProductionOrders() {
  useEffect(() => {
    if (!hydrationRequest) hydrationRequest = hydrateStore();
  }, []);
  return useSyncExternalStore(subscribe, getOrders, () => initialOrders);
}

export function useInspectionRecords() {
  useEffect(() => {
    if (!hydrationRequest) hydrationRequest = hydrateStore();
  }, []);
  return useSyncExternalStore(
    subscribe,
    getInspections,
    () => initialInspections,
  );
}

export function useDispatchRecords() {
  useEffect(() => {
    if (!hydrationRequest) hydrationRequest = hydrateStore();
  }, []);
  return useSyncExternalStore(
    subscribe,
    getDispatches,
    () => initialDispatches,
  );
}

export function getDispatchOrderQuantities(po: string) {
  const qcPassed = inspections
    .filter((inspection) => inspection.po === po)
    .reduce((total, inspection) => total + inspection.quantityPassed, 0);
  const orderDispatches = dispatches.filter(
    (dispatch) => dispatch.po === po,
  );
  const dispatched = orderDispatches.reduce(
    (total, dispatch) => total + dispatch.dispatchedQuantity,
    0,
  );
  const allocated = orderDispatches
    .filter((dispatch) => dispatch.status !== "CANCELLED")
    .reduce(
      (total, dispatch) =>
        total + dispatch.quantity - dispatch.dispatchedQuantity,
      0,
    );

  return {
    qcPassed,
    dispatched,
    ready: Math.max(0, qcPassed - dispatched),
    availableToAllocate: Math.max(0, qcPassed - dispatched - allocated),
  };
}

export function useProductionActivity() {
  return useSyncExternalStore(subscribe, () => activities, () => activities);
}

export function useProductionWipStages() {
  return useSyncExternalStore(subscribe, () => wipStages, () => wipStages);
}

export function useProductionSummary() {
  return useSyncExternalStore(
    subscribe,
    () => productionSummary,
    () => productionSummary,
  );
}

function inspectionStatus(
  input: InspectionInput,
  quantityProduced: number,
): InspectionStatus {
  if (
    input.materialCertificate === "Missing" ||
    input.status === "Failed" ||
    input.measurements.some((measurement) => measurement.result === "FAIL") ||
    input.quantityRejected > 0
  ) {
    return "Failed";
  }
  if (
    input.quantityInspected <= 0 &&
    input.status === "Pending"
  ) {
    return "Pending";
  }
  if (input.materialCertificate === "Pending" || input.status === "Hold") {
    return "Hold";
  }
  if (input.quantityInspected <= 0) return "Pending";
  if (input.status === "Passed") return "Passed";
  if (input.status === "In Inspection") return "In Inspection";
  if (input.quantityInspected < quantityProduced) return "In Inspection";
  return "Passed";
}

function syncInspectionOrder(po: string) {
  const order = orders.find((item) => item.po === po);
  if (!order) return;

  inspections = inspections.map((inspection) =>
    inspection.po === po
      ? {
          ...inspection,
          customer: order.customer,
          part: order.part,
          material: order.material,
          machine: order.machine,
          quantityProduced: order.produced,
          status: inspectionStatus(inspection, order.produced),
        }
      : inspection,
  );
}

function validateInspection(
  input: InspectionInput,
  editingId?: string,
): { success: boolean; error?: string } {
  const order = orders.find((item) => item.po === input.po);
  if (!order) return { success: false, error: "Select a valid production order." };
  if (order.status === "Cancelled") {
    return { success: false, error: "Cancelled orders cannot be inspected." };
  }
  if (!Number.isInteger(input.quantityInspected) || input.quantityInspected < 0) {
    return { success: false, error: "Inspection quantity must be a whole number." };
  }
  if (!Number.isInteger(input.quantityPassed) || input.quantityPassed < 0) {
    return { success: false, error: "Passed quantity must be a whole number." };
  }
  if (!Number.isInteger(input.quantityRejected) || input.quantityRejected < 0) {
    return { success: false, error: "Rejected quantity must be a whole number." };
  }
  if (input.quantityPassed + input.quantityRejected !== input.quantityInspected) {
    return {
      success: false,
      error: "Passed and rejected quantities must add up to the inspected quantity.",
    };
  }
  const alreadyInspected = inspections
    .filter((inspection) => inspection.po === input.po && inspection.id !== editingId)
    .reduce((total, inspection) => total + inspection.quantityInspected, 0);
  const alreadyPassed = inspections
    .filter((inspection) => inspection.po === input.po && inspection.id !== editingId)
    .reduce((total, inspection) => total + inspection.quantityPassed, 0);
  if (alreadyInspected + input.quantityInspected > order.produced) {
    return {
      success: false,
      error: `Inspection quantity exceeds the available production quantity (${Math.max(0, order.produced - alreadyInspected)} pcs available).`,
    };
  }
  if (!input.batch.trim()) {
    return { success: false, error: "Batch / lot number is required." };
  }
  if (!input.inspector.trim()) {
    return { success: false, error: "Inspector name is required." };
  }
  if (input.measurements.length === 0) {
    return { success: false, error: "At least one quality measurement is required." };
  }
  if (
    input.quantityInspected > 0 &&
    input.measurements.some(
      (measurement) =>
        ["od", "id", "length", "critical"].includes(measurement.key) &&
        (!Number.isFinite(Number.parseFloat(measurement.nominal)) ||
          !Number.isFinite(Number.parseFloat(measurement.actual)) ||
          !Number.isFinite(
            Number.parseFloat(measurement.tolerance.replace("±", "")),
          ) ||
          Number.parseFloat(measurement.tolerance.replace("±", "")) < 0),
    )
  ) {
    return {
      success: false,
      error:
        "Enter numeric nominal, actual, and non-negative tolerance values for OD, ID, length, and critical dimension.",
    };
  }
  if (
    input.quantityInspected > 0 &&
    input.measurements.some(
      (measurement) =>
        ["thread", "surface"].includes(measurement.key) &&
        (!measurement.nominal.trim() || !measurement.actual.trim()),
    )
  ) {
    return {
      success: false,
      error:       "Enter nominal and actual inspection findings for thread and visual checks.",
    };
  }
  const dispatchSummary = getDispatchOrderQuantities(input.po);
  const protectedPassedQuantity =
    dispatchSummary.qcPassed - dispatchSummary.availableToAllocate;
  if (alreadyPassed + input.quantityPassed < protectedPassedQuantity) {
    return {
      success: false,
      error:
      "Passed quantity cannot be reduced below quantities already dispatched or allocated for dispatch.",
    };
  }
  if (
    input.status === "Passed" &&
    (input.quantityInspected <= 0 ||
      alreadyInspected + input.quantityInspected < order.produced ||
      input.quantityRejected > 0 ||
      input.materialCertificate !== "Verified" ||
      input.measurements.some((measurement) => measurement.result === "FAIL"))
  ) {
    return {
      success: false,
      error:
        "Inspection cannot be marked Passed until all produced pieces are inspected and all quality checks pass.",
    };
  }
  return { success: true };
}

export async function createInspection(
  input: InspectionInput,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const validation = validateInspection(input);
  if (!validation.success) return validation;

  const order = orders.find((item) => item.po === input.po);
  if (!order) return { success: false, error: "Select a valid production order." };
  const id = `INSP-${new Date(input.date).getFullYear()}-${String(nextInspectionSequence++).padStart(3, "0")}`;
  const record: InspectionRecord = {
    ...input,
    id,
    customer: order.customer,
    part: order.part,
    material: order.material,
    machine: order.machine,
    quantityProduced: order.produced,
    status: inspectionStatus(input, order.produced),
  };
  inspections = [record, ...inspections];
  const machine = machines.find((item) => item.name === order.machine);
  if (machine) recordActivity(machine, `Quality inspection ${id} recorded`);
  const saved = await notify("inspection");
  if (!saved.success) return saved;
  return { success: true, id };
}

export async function updateInspection(
  id: string,
  input: InspectionInput,
): Promise<{ success: boolean; error?: string }> {
  const existing = inspections.find((inspection) => inspection.id === id);
  if (!existing) return { success: false, error: "Inspection record was not found." };
  const validation = validateInspection(input, id);
  if (!validation.success) return validation;
  if (existing.po !== input.po) {
    const oldOrderQuantities = getDispatchOrderQuantities(existing.po);
    const protectedOldPassedQuantity =
      oldOrderQuantities.qcPassed - oldOrderQuantities.availableToAllocate;
    const remainingOldPassedQuantity =
      oldOrderQuantities.qcPassed - existing.quantityPassed;
    if (remainingOldPassedQuantity < protectedOldPassedQuantity) {
      return {
        success: false,
        error:
          "This inspection cannot be moved because its passed quantity is already dispatched or allocated.",
      };
    }
  }

  const order = orders.find((item) => item.po === input.po);
  if (!order) return { success: false, error: "Select a valid production order." };
  inspections = inspections.map((inspection) =>
    inspection.id === id
      ? {
          ...input,
          id,
          customer: order.customer,
          part: order.part,
          material: order.material,
          machine: order.machine,
          quantityProduced: order.produced,
          status: inspectionStatus(input, order.produced),
        }
      : inspection,
  );
  const machine = machines.find((item) => item.name === order.machine);
  if (machine) recordActivity(machine, `Quality inspection ${id} updated`);
  return notify("inspection");
}

function dispatchStatus(
  quantity: number,
  dispatchedQuantity: number,
): DispatchStatus {
  if (dispatchedQuantity >= quantity) return "DISPATCHED";
  if (dispatchedQuantity > 0) return "PARTIALLY DISPATCHED";
  return "READY";
}

function validateDispatchInput(
  input: DispatchInput,
  editingId?: string,
): { success: boolean; error?: string } {
  const order = orders.find((item) => item.po === input.po);
  if (!order) return { success: false, error: "Select a valid production order." };
  if (order.status === "Cancelled") {
    return { success: false, error: "Cancelled orders cannot be dispatched." };
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { success: false, error: "Dispatch quantity must be a positive whole number." };
  }
  if (!input.date) {
    return { success: false, error: "Dispatch date is required." };
  }

  const oldRecord = editingId
    ? dispatches.find((dispatch) => dispatch.id === editingId)
    : undefined;
  if (oldRecord?.dispatchedQuantity && oldRecord.po !== input.po) {
    return {
      success: false,
      error: "A dispatch with shipped quantity cannot be reassigned to another order.",
    };
  }
  const summary = getDispatchOrderQuantities(input.po);
  const releasedAllocation =
    oldRecord &&
    oldRecord.po === input.po &&
    oldRecord.status !== "CANCELLED"
      ? oldRecord.quantity - oldRecord.dispatchedQuantity
      : 0;
  const maximumQuantity =
    summary.availableToAllocate + releasedAllocation +
    (oldRecord?.dispatchedQuantity ?? 0);
  if (input.quantity > maximumQuantity) {
    return {
      success: false,
      error: `Dispatch quantity exceeds available QC-passed quantity (${maximumQuantity} pcs available).`,
    };
  }
  if (input.quantity < (oldRecord?.dispatchedQuantity ?? 0)) {
    return {
      success: false,
      error: "Dispatch quantity cannot be lower than the quantity already shipped.",
    };
  }
  return { success: true };
}

export async function createDispatch(
  input: DispatchInput,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const validation = validateDispatchInput(input);
  if (!validation.success) return validation;
  const id = `DSP-${new Date(input.date).getFullYear()}-${String(nextDispatchSequence++).padStart(3, "0")}`;
  const record: DispatchRecord = {
    ...input,
    id,
    dispatchedQuantity: 0,
    status: "READY",
  };
  dispatches = [record, ...dispatches];
  const order = orders.find((item) => item.po === record.po);
  const machine = machines.find((item) => item.name === order?.machine);
  if (machine) recordActivity(machine, `Dispatch ${id} ready for ${record.quantity} pcs`);
  const saved = await notify("dispatch");
  if (!saved.success) return saved;
  return { success: true, id };
}

export async function updateDispatch(
  id: string,
  input: DispatchInput,
): Promise<{ success: boolean; error?: string }> {
  const existing = dispatches.find((dispatch) => dispatch.id === id);
  if (!existing) return { success: false, error: "Dispatch record was not found." };
  if (existing.status === "CANCELLED") {
    return { success: false, error: "Cancelled dispatches cannot be edited." };
  }
  const validation = validateDispatchInput(input, id);
  if (!validation.success) return validation;

  dispatches = dispatches.map((dispatch) =>
    dispatch.id === id
      ? {
          ...dispatch,
          ...input,
          status:
            dispatch.status === "HOLD"
              ? "HOLD"
              : dispatchStatus(input.quantity, dispatch.dispatchedQuantity),
        }
      : dispatch,
  );
  return notify("dispatch");
}

export async function markDispatchShipped(
  id: string,
  quantity?: number,
): Promise<{ success: boolean; error?: string }> {
  const dispatch = dispatches.find((item) => item.id === id);
  if (!dispatch) return { success: false, error: "Dispatch record was not found." };
  if (dispatch.status === "CANCELLED") {
    return { success: false, error: "Cancelled dispatches cannot be shipped." };
  }
  if (dispatch.status === "HOLD") {
    return { success: false, error: "Release the dispatch from Hold before shipping." };
  }

  const remaining = dispatch.quantity - dispatch.dispatchedQuantity;
  const quantityToShip = quantity ?? remaining;
  if (!Number.isInteger(quantityToShip) || quantityToShip <= 0) {
    return { success: false, error: "Ship quantity must be a positive whole number." };
  }
  if (quantityToShip > remaining) {
    return {
      success: false,
      error: `Ship quantity exceeds this dispatch balance (${remaining} pcs).`,
    };
  }

  const summary = getDispatchOrderQuantities(dispatch.po);
  if (quantityToShip > summary.qcPassed - summary.dispatched) {
    return {
      success: false,
      error: "Dispatch quantity exceeds available QC-passed quantity.",
    };
  }

  const nextShipped = dispatch.dispatchedQuantity + quantityToShip;
  dispatches = dispatches.map((item) =>
    item.id === id
      ? {
          ...item,
          dispatchedQuantity: nextShipped,
          date: new Date().toISOString().slice(0, 10),
          status: dispatchStatus(item.quantity, nextShipped),
        }
      : item,
  );
  const order = orders.find((item) => item.po === dispatch.po);
  const machine = machines.find((item) => item.name === order?.machine);
  if (machine) {
    recordActivity(
      machine,
      `Dispatch ${id}: ${quantityToShip.toLocaleString()} pcs shipped`,
    );
  }
  return notify("dispatch");
}

export async function setDispatchHold(
  id: string,
  hold: boolean,
): Promise<{ success: boolean; error?: string }> {
  const dispatch = dispatches.find((item) => item.id === id);
  if (!dispatch) return { success: false, error: "Dispatch record was not found." };
  if (dispatch.status === "CANCELLED" || dispatch.status === "DISPATCHED") {
    return { success: false, error: "This dispatch cannot be put on or released from hold." };
  }
  dispatches = dispatches.map((item) =>
    item.id === id
      ? {
          ...item,
          status: hold
            ? "HOLD"
            : dispatchStatus(item.quantity, item.dispatchedQuantity),
        }
      : item,
  );
  return notify("dispatch");
}

export async function cancelDispatch(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const dispatch = dispatches.find((item) => item.id === id);
  if (!dispatch) return { success: false, error: "Dispatch record was not found." };
  if (dispatch.status === "CANCELLED") {
    return { success: false, error: "Dispatch is already cancelled." };
  }
  if (dispatch.status === "DISPATCHED") {
    return {
      success: false,
      error: "A fully shipped dispatch cannot be cancelled.",
    };
  }
  dispatches = dispatches.map((item) =>
    item.id === id ? { ...item, status: "CANCELLED" } : item,
  );
  const order = orders.find((item) => item.po === dispatch.po);
  const machine = machines.find((item) => item.name === order?.machine);
  if (machine) recordActivity(machine, `Dispatch ${id} cancelled`);
  return notify("dispatch");
}

export async function setMachineStatus(
  name: string,
  status: MachineStatus,
): Promise<{ success: boolean; error?: string }> {
  const currentMachine = machines.find((machine) => machine.name === name);
  const currentOrder = orders.find(
    (order) => order.po === currentMachine?.order,
  );
  if (
    status === "RUNNING" &&
    (!currentOrder ||
      currentOrder.status === "Completed" ||
      currentOrder.status === "Cancelled")
  ) {
    return { success: false, error: "A machine cannot run without an active order." };
  }

  let updatedMachine: ProductionMachine | undefined;
  machines = machines.map((machine) => {
    if (machine.name !== name || machine.status === status) return machine;
    updatedMachine = { ...machine, status };
    return updatedMachine;
  });

  if (!updatedMachine) return { success: true };
  if (updatedMachine.order) {
    orders = orders.map((order) => {
      if (order.po !== updatedMachine?.order) return order;
      if (order.status === "Completed" || order.status === "Cancelled") {
        return order;
      }
      if (status === "RUNNING") return { ...order, status: "In Production" };
      if (status === "PAUSED" || status === "STOPPED" || status === "MAINTENANCE") {
        return { ...order, status: "On Hold" };
      }
      return order;
    });
    syncInspectionOrder(updatedMachine.order);
  }
  recordActivity(updatedMachine, `Status changed to ${status}`);
  return notify("machine");
}

export async function incrementMachineProduction(name: string, quantity = 1) {
  if (!Number.isFinite(quantity) || quantity <= 0) return;

  const increment = Math.floor(quantity);
  if (increment === 0) return;

  let productionChanged = false;
  machines = machines.map((machine) => {
    const order = orders.find((item) => item.po === machine.order);
    if (
      machine.name !== name ||
      !order ||
      order.status === "Cancelled" ||
      order.status === "Completed" ||
      machine.status !== "RUNNING" ||
      machine.produced >= machine.target
    ) {
      return machine;
    }

    productionChanged = true;
    const produced = Math.min(machine.target, machine.produced + increment);
    return {
      ...machine,
      produced,
      status: produced >= machine.target ? "IDLE" : machine.status,
    };
  });

  if (productionChanged) {
    const updatedMachine = machines.find((machine) => machine.name === name);
    if (updatedMachine) {
      orders = orders.map((order) =>
        order.po === updatedMachine.order
          ? {
              ...order,
              produced: updatedMachine.produced,
              status:
                updatedMachine.produced >= updatedMachine.target
                  ? "Completed"
                  : order.status,
            }
          : order,
      );
      syncInspectionOrder(updatedMachine.order);
    }
    if (updatedMachine) {
      recordActivity(
        updatedMachine,
        updatedMachine.produced >= updatedMachine.target
          ? "Order target completed"
          : `Produced quantity increased by ${increment}`,
      );
    }
    return notify("production");
  }
}

export async function incrementRunningMachinesProduction() {
  let productionChanged = false;
  const updatedMachines: ProductionMachine[] = [];
  machines = machines.map((machine) => {
    const order = orders.find((item) => item.po === machine.order);
    if (
      !order ||
      order.status === "Cancelled" ||
      order.status === "Completed" ||
      machine.status !== "RUNNING" ||
      machine.produced >= machine.target
    ) {
      return machine;
    }

    productionChanged = true;
    const updatedStatus: MachineStatus =
      machine.produced + 1 >= machine.target ? "IDLE" : machine.status;
    const updatedMachine: ProductionMachine = {
      ...machine,
      produced: Math.min(machine.target, machine.produced + 1),
      status: updatedStatus,
    };
    updatedMachines.push(updatedMachine);
    return updatedMachine;
  });

  if (productionChanged) {
    updatedMachines.forEach((machine) => {
      orders = orders.map((order) =>
        order.po === machine.order
          ? {
              ...order,
              produced: machine.produced,
              status:
                machine.produced >= machine.target
                  ? "Completed"
                  : order.status,
            }
          : order,
      );
      syncInspectionOrder(machine.order);
      recordActivity(
        machine,
        machine.produced >= machine.target
          ? "Order target completed"
          : "Production quantity updated by 1 pc",
      );
    });
    return notify("production");
  }
}

export async function resetMachine(name: string) {
  if (!machines.some((machine) => machine.name === name)) {
    return { success: false, error: "Machine was not found." };
  }
  return {
    success: false,
    error: "Production history cannot be reset. Change the machine status instead.",
  };
}

export async function createProductionOrder(
  input: ProductionOrderInput,
): Promise<{ success: boolean; error?: string }> {
  if (orders.some((order) => order.po.toLowerCase() === input.po.toLowerCase())) {
    return { success: false, error: "That PO number already exists." };
  }
  if (!Number.isInteger(input.target) || input.target <= 0) {
    return { success: false, error: "Target quantity must be a positive whole number." };
  }
  const order: ProductionOrder = {
    ...input,
    status: "Pending",
    produced: 0,
  };

  orders = [...orders, order];
  syncInspectionOrder(order.po);
  const machine = machines.find((item) => item.name === order.machine);
  if (machine) recordActivity(machine, `New order ${order.po} assigned`);
  return notify("order");
}

export async function updateProductionOrder(
  po: string,
  input: ProductionOrderInput,
): Promise<{ success: boolean; error?: string }> {
  const existingOrder = orders.find((order) => order.po === po);
  if (!existingOrder) return { success: false, error: "Order was not found." };
  if (existingOrder.status === "Cancelled") {
    return { success: false, error: "Cancelled orders cannot be edited." };
  }
  if (
    input.po.toLowerCase() !== po.toLowerCase() &&
    orders.some((order) => order.po.toLowerCase() === input.po.toLowerCase())
  ) {
    return { success: false, error: "That PO number already exists." };
  }
  if (!Number.isInteger(input.target) || input.target <= 0) {
    return { success: false, error: "Target quantity must be a positive whole number." };
  }
  if (input.target < existingOrder.produced) {
    return {
      success: false,
      error: "Target quantity cannot be lower than the quantity already produced.",
    };
  }
  const nextOrder: ProductionOrder = {
    ...existingOrder,
    ...input,
    status: input.machine !== existingOrder.machine
      ? machines.find((machine) => machine.name === input.machine)?.status ===
        "RUNNING"
        ? "In Production"
        : existingOrder.status === "Pending"
          ? "Pending"
          : "On Hold"
      : existingOrder.status === "Completed" && input.target > existingOrder.produced
        ? "On Hold"
        : existingOrder.status,
  };
  const currentlyAssigned = machines.some(
    (machine) => machine.order === existingOrder.po,
  );
  if (currentlyAssigned || input.machine !== existingOrder.machine) {
    const result = assignOrderToMachine(
      nextOrder,
      existingOrder.machine,
      existingOrder.po,
    );
    if (!result.success) return result;
  }

  orders = orders.map((order) =>
    order.po === po ? nextOrder : order,
  );
  if (po !== input.po) {
    orders = orders.map((order) =>
      order.po === po ? { ...order, po: input.po } : order,
    );
    inspections = inspections.map((inspection) =>
      inspection.po === po ? { ...inspection, po: input.po } : inspection,
    );
    dispatches = dispatches.map((dispatch) =>
      dispatch.po === po ? { ...dispatch, po: input.po } : dispatch,
    );
  }
  syncInspectionOrder(input.po);
  const machine = machines.find((item) => item.order === input.po);
  if (machine) recordActivity(machine, `Order ${input.po} updated`);
  return notify(
    "order",
    po !== input.po ? [{ from: po, to: input.po }] : undefined,
  );
}

function assignOrderToMachine(
  order: ProductionOrder,
  previousMachineName?: string,
  previousOrderPo = order.po,
): { success: boolean; error?: string } {
  const assignedMachine = machines.find(
    (machine) => machine.name === order.machine,
  );
  if (!assignedMachine) {
    return { success: false, error: "Select a valid CNC machine." };
  }

  if (previousMachineName && previousMachineName !== order.machine) {
    const previousMachine = machines.find(
      (machine) => machine.name === previousMachineName,
    );
    if (previousMachine?.order === previousOrderPo) {
      machines = machines.map((machine) =>
        machine.name === previousMachineName
          ? {
              ...machine,
              status: "IDLE",
              order: "",
              part: "No active order",
              material: "—",
              target: 0,
              produced: 0,
            }
          : machine,
      );
    }
  }

  const displacedOrder = orders.find(
    (item) =>
      item.machine === order.machine &&
      item.po !== order.po &&
      item.status !== "Completed" &&
      item.status !== "Cancelled",
  );
  if (displacedOrder) {
    orders = orders.map((item) =>
      item.po === displacedOrder.po ? { ...item, status: "On Hold" } : item,
    );
  }

  const currentMachine = machines.find(
    (machine) => machine.name === order.machine,
  );
  if (!currentMachine) {
    return { success: false, error: "Assigned CNC machine was not found." };
  }
  const machineStatus =
    order.status === "Cancelled" || order.status === "Completed"
      ? "IDLE"
      : order.status === "In Production"
        ? "RUNNING"
      : currentMachine.status;
  machines = machines.map((machine) =>
    machine.name === order.machine
      ? {
          ...machine,
          status: machineStatus,
          order: order.po,
          part: order.part,
          material: order.material,
          target: order.target,
          produced: order.produced,
        }
      : machine,
  );
  return { success: true };
}

export async function setProductionOrderStatus(
  po: string,
  status: OrderStatus,
): Promise<{ success: boolean; error?: string }> {
  const order = orders.find((item) => item.po === po);
  if (!order) return { success: false, error: "Order was not found." };
  if (status === "Completed" && order.produced < order.target) {
    return {
      success: false,
      error: "An order can only be completed after its target quantity is produced.",
    };
  }

  let linkedMachine = machines.find((machine) => machine.order === po);
  if (status === "In Production" && !linkedMachine) {
    const result = assignOrderToMachine(
      { ...order, status: "In Production" },
      order.machine,
    );
    if (!result.success) return result;
    linkedMachine = machines.find((machine) => machine.order === po);
  }

  orders = orders.map((item) => (item.po === po ? { ...item, status } : item));
  machines = machines.map((machine) => {
    if (machine.order !== po) return machine;
    if (status === "Cancelled") {
      return {
        ...machine,
        status: "IDLE",
        order: "",
        part: "No active order",
        material: "—",
        target: 0,
        produced: 0,
      };
    }
    if (status === "Completed") return { ...machine, status: "IDLE" };
    if (status === "On Hold") {
      return { ...machine, status: "PAUSED" };
    }
    if (status === "In Production") {
      return { ...machine, status: "RUNNING" };
    }
    return { ...machine, status: "IDLE" };
  });

  if (linkedMachine) recordActivity(linkedMachine, `Order status changed to ${status}`);
  syncInspectionOrder(po);
  return notify("order");
}
