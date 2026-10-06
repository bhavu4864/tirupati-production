"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import MainNavigation from "../components/main-navigation";
import {
  createInspection,
  updateInspection,
  useDispatchRecords,
  useInspectionRecords,
  useProductionMachines,
  useProductionOrders,
  type InspectionInput,
  type InspectionRecord,
  type InspectionStatus,
  type MeasurementResult,
  type QualityMeasurement,
} from "../lib/production-store";

type InspectionFormValues = {
  po: string;
  batch: string;
  quantityInspected: string;
  quantityPassed: string;
  status: InspectionStatus;
  inspector: string;
  date: string;
  remarks: string;
  materialCertificate: InspectionInput["materialCertificate"];
  measurements: QualityMeasurement[];
};

type SortKey = "date" | "quantity" | "status";

const inspectionStatuses: InspectionStatus[] = [
  "Pending",
  "In Inspection",
  "Passed",
  "Failed",
  "Hold",
];

const statusStyles: Record<InspectionStatus, string> = {
  Pending: "bg-slate-100 text-slate-600",
  "In Inspection": "bg-blue-100 text-blue-700",
  Passed: "bg-green-100 text-green-700",
  Failed: "bg-red-100 text-red-700",
  Hold: "bg-amber-100 text-amber-700",
};

const statusRank: Record<InspectionStatus, number> = {
  Pending: 0,
  "In Inspection": 1,
  Hold: 2,
  Failed: 3,
  Passed: 4,
};

function defaultMeasurements(): QualityMeasurement[] {
  return [
    { key: "od", label: "OD", nominal: "", actual: "", tolerance: "±0.05 mm", result: "PASS" },
    { key: "id", label: "ID", nominal: "", actual: "", tolerance: "±0.05 mm", result: "PASS" },
    { key: "length", label: "Overall Length", nominal: "", actual: "", tolerance: "±0.10 mm", result: "PASS" },
    { key: "thread", label: "Thread", nominal: "", actual: "", tolerance: "6H fit", result: "PASS" },
    { key: "critical", label: "Critical dimension", nominal: "", actual: "", tolerance: "±0.03 mm", result: "PASS" },
    { key: "surface", label: "Surface / visual inspection", nominal: "No burrs, cracks or porosity", actual: "", tolerance: "Visual standard", result: "PASS" },
    { key: "certificate", label: "Material certificate", nominal: "Required / heat traceable", actual: "Verified", tolerance: "Certificate review", result: "PASS" },
  ];
}

function emptyForm(po: string): InspectionFormValues {
  return {
    po,
    batch: "",
    quantityInspected: "",
    quantityPassed: "",
    status: "Pending",
    inspector: "",
    date: new Date().toISOString().slice(0, 10),
    remarks: "",
    materialCertificate: "Verified",
    measurements: defaultMeasurements(),
  };
}

function formFromRecord(record: InspectionRecord): InspectionFormValues {
  return {
    po: record.po,
    batch: record.batch,
    quantityInspected: String(record.quantityInspected),
    quantityPassed: String(record.quantityPassed),
    status: record.status,
    inspector: record.inspector,
    date: record.date,
    remarks: record.remarks,
    materialCertificate: record.materialCertificate,
    measurements: record.measurements.map((measurement) => ({ ...measurement })),
  };
}

function measurementResult(measurement: QualityMeasurement): MeasurementResult {
  if (["thread", "surface", "certificate"].includes(measurement.key)) {
    return measurement.result;
  }
  if (!measurement.actual.trim() || measurement.actual.trim() === "—") {
    return measurement.result;
  }
  const nominal = Number.parseFloat(measurement.nominal);
  const actual = Number.parseFloat(measurement.actual);
  const tolerance = Number.parseFloat(measurement.tolerance.replace("±", ""));
  if (
    Number.isFinite(nominal) &&
    Number.isFinite(actual) &&
    Number.isFinite(tolerance)
  ) {
    return Math.abs(actual - nominal) <= tolerance ? "PASS" : "FAIL";
  }
  return "FAIL";
}

function formToInput(
  values: InspectionFormValues,
  record: InspectionRecord,
  machineName: string,
): InspectionInput {
  const quantityInspected = Number(values.quantityInspected);
  const quantityPassed = Number(values.quantityPassed);
  const measurements = values.measurements.map((measurement) => ({
    ...measurement,
    result:
      measurement.key === "certificate"
        ? values.materialCertificate === "Verified"
          ? "PASS"
          : values.materialCertificate === "Missing"
            ? "FAIL"
            : "PASS"
        : measurementResult(measurement),
  }));

  return {
    date: values.date,
    po: values.po,
    status: values.status,
    customer: record.customer,
    part: record.part,
    material: record.material,
    machine: machineName,
    batch: values.batch.trim(),
    quantityInspected,
    quantityPassed,
    quantityRejected: quantityInspected - quantityPassed,
    inspector: values.inspector.trim(),
    remarks: values.remarks.trim(),
    measurements,
    materialCertificate: values.materialCertificate,
  };
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function InspectionPage() {
  const inspections = useInspectionRecords();
  const dispatches = useDispatchRecords();
  const orders = useProductionOrders();
  const machines = useProductionMachines();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | InspectionStatus>("All");
  const [materialFilter, setMaterialFilter] = useState("All");
  const [machineFilter, setMachineFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [descending, setDescending] = useState(true);
  const [formValues, setFormValues] = useState<InspectionFormValues | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<InspectionRecord | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const totalInspected = inspections.reduce(
    (total, record) => total + record.quantityInspected,
    0,
  );
  const totalPassed = inspections.reduce(
    (total, record) => total + record.quantityPassed,
    0,
  );
  const totalRejected = inspections.reduce(
    (total, record) => total + record.quantityRejected,
    0,
  );
  const inspectedByOrder = inspections.reduce<Record<string, number>>(
    (totals, record) => {
      totals[record.po] = (totals[record.po] ?? 0) + record.quantityInspected;
      return totals;
    },
    {},
  );
  const pendingInspection = orders
    .filter((order) => order.status !== "Cancelled")
    .reduce(
      (total, order) =>
        total + Math.max(0, order.produced - (inspectedByOrder[order.po] ?? 0)),
      0,
    );
  const firstPassYield = totalInspected
    ? Math.round((totalPassed / totalInspected) * 100)
    : 0;
  const rejectionRate = totalInspected
    ? Math.round((totalRejected / totalInspected) * 100)
    : 0;
  const dispatchedQuantity = dispatches
    .reduce((total, dispatch) => total + dispatch.dispatchedQuantity, 0);

  const visibleInspections = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = inspections.filter((record) => {
      const matchesSearch =
        !query ||
        [
          record.id,
          record.po,
          record.customer,
          record.part,
          record.machine,
          record.batch,
          record.inspector,
        ].some((value) => value.toLowerCase().includes(query));
      return (
        matchesSearch &&
        (statusFilter === "All" || record.status === statusFilter) &&
        (materialFilter === "All" || record.material === materialFilter) &&
        (machineFilter === "All" || record.machine === machineFilter)
      );
    });

    return filtered.sort((left, right) => {
      let compare = 0;
      if (sortKey === "date") compare = left.date.localeCompare(right.date);
      if (sortKey === "quantity") {
        compare = left.quantityInspected - right.quantityInspected;
      }
      if (sortKey === "status") {
        compare = statusRank[left.status] - statusRank[right.status];
      }
      return descending ? -compare : compare;
    });
  }, [
    descending,
    inspections,
    machineFilter,
    materialFilter,
    search,
    sortKey,
    statusFilter,
  ]);

  function openNewInspection() {
    const availableOrder = orders.find(
      (order) =>
        order.status !== "Cancelled" &&
        order.produced > (inspectedByOrder[order.po] ?? 0),
    );
    setFormValues(emptyForm(availableOrder?.po ?? orders[0]?.po ?? ""));
    setEditingId(null);
    setFormError("");
    setNotice("");
  }

  function openEdit(record: InspectionRecord) {
    setFormValues(formFromRecord(record));
    setEditingId(record.id);
    setFormError("");
    setNotice("");
  }

  function updateMeasurement(
    key: string,
    property: "nominal" | "actual" | "tolerance" | "result",
    value: string,
  ) {
    setFormValues((current) =>
      current
        ? {
            ...current,
            measurements: current.measurements.map((measurement) =>
              measurement.key === key
                ? {
                    ...measurement,
                    [property]: value,
                    ...(property === "actual" ||
                    property === "nominal" ||
                    property === "tolerance"
                      ? { result: measurementResult({ ...measurement, [property]: value }) }
                      : {}),
                  }
                : measurement,
            ),
          }
        : current,
    );
  }

  async function submitInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formValues) return;
    const selectedOrder = orders.find((order) => order.po === formValues.po);
    if (!selectedOrder) {
      setFormError("Select a valid production order.");
      return;
    }
    const input = formToInput(
      formValues,
      {
        id: editingId ?? "",
        date: formValues.date,
        po: selectedOrder.po,
        customer: selectedOrder.customer,
        part: selectedOrder.part,
        material: selectedOrder.material,
        machine: selectedOrder.machine,
        batch: formValues.batch,
        quantityProduced: selectedOrder.produced,
        quantityInspected: Number(formValues.quantityInspected),
        quantityPassed: Number(formValues.quantityPassed),
        quantityRejected: 0,
        inspector: formValues.inspector,
        status: "Pending",
        remarks: formValues.remarks,
        measurements: formValues.measurements,
        materialCertificate: formValues.materialCertificate,
      },
      selectedOrder.machine,
    );
    const result = editingId
      ? await updateInspection(editingId, input)
      : await createInspection(input);
    if (!result.success) {
      setFormError(result.error ?? "Inspection could not be saved.");
      return;
    }

    const createdId = "id" in result ? result.id : undefined;
    setNotice(
      editingId
        ? `Inspection ${editingId} updated.`
        : `Inspection ${createdId ?? ""} recorded.`,
    );
    setFormValues(null);
    setEditingId(null);
    setFormError("");
  }

  const formOrder = formValues
    ? orders.find((order) => order.po === formValues.po)
    : undefined;
  const formProduced = formOrder?.produced ?? 0;
  const formAlreadyInspected = formOrder
    ? inspections
        .filter(
          (record) => record.po === formOrder.po && record.id !== editingId,
        )
        .reduce((total, record) => total + record.quantityInspected, 0)
    : 0;
  const maxInspectionQuantity = Math.max(0, formProduced - formAlreadyInspected);
  const inspectedInput = Number(formValues?.quantityInspected ?? 0);
  const passedInput = Number(formValues?.quantityPassed ?? 0);
  const rejectedInput = Math.max(0, inspectedInput - passedInput);
  const currentViewingRecord = viewingRecord
    ? inspections.find((record) => record.id === viewingRecord.id) ?? viewingRecord
    : null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-950 px-4 py-4 text-white sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-lg font-bold tracking-tight sm:text-2xl">
              TIRUPATI BRASS INDUSTRIES
            </p>
            <p className="text-xs text-slate-400 sm:text-sm">
              CNC Production Control • Jamnagar
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="hidden text-sm text-slate-400 sm:block">Production Status</p>
            <p className="text-xs font-semibold text-green-400 sm:text-sm">
              <span aria-hidden="true">● </span>SYSTEM ONLINE
            </p>
          </div>
        </div>
      </header>

      <MainNavigation />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-blue-600">
              Tirupati Brass Industries
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              Inspection / Quality Control
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              In-process and final inspection for CNC brass and aluminium bronze components
            </p>
          </div>
          <button
            type="button"
            onClick={openNewInspection}
            className="inline-flex w-fit items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <span aria-hidden="true" className="mr-2 text-lg leading-none">+</span>
            New Inspection
          </button>
        </div>

        <section
          aria-label="Inspection quality summary"
          className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-7"
        >
          <Kpi label="Total Inspected" value={`${totalInspected.toLocaleString()} pcs`} />
          <Kpi label="Passed" value={`${totalPassed.toLocaleString()} pcs`} tone="green" />
          <Kpi label="Rejected" value={`${totalRejected.toLocaleString()} pcs`} tone="red" />
          <Kpi label="Pending Inspection" value={`${pendingInspection.toLocaleString()} pcs`} tone="amber" />
          <Kpi label="First-pass Yield" value={`${firstPassYield}%`} tone="blue" />
          <Kpi label="Rejection Rate" value={`${rejectionRate}%`} tone="red" />
          <Kpi label="Dispatched" value={`${dispatchedQuantity.toLocaleString()} pcs`} tone="blue" />
        </section>

        {notice && (
          <div
            role="status"
            className="mt-5 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            {notice}
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
              className="ml-3 font-semibold text-green-700 hover:text-green-900"
            >
              ×
            </button>
          </div>
        )}

        {formValues && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">
                  {editingId ? `Edit Inspection ${editingId}` : "New Inspection Record"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Measurements and inspected quantities are validated against live production.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormValues(null)}
                aria-label="Close inspection form"
                className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <form onSubmit={submitInspection}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="PO Number">
                  <select
                    required
                    value={formValues.po}
                    onChange={(event) =>
                      setFormValues({ ...formValues, po: event.target.value })
                    }
                    className={inputClass}
                  >
                    {orders
                      .filter((order) => order.status !== "Cancelled")
                      .map((order) => (
                        <option key={order.po} value={order.po}>
                          {order.po} — {order.part}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Part">
                  <input
                    readOnly
                    value={formOrder?.part ?? ""}
                    className={`${inputClass} bg-slate-50`}
                  />
                </Field>
                <Field label="Material">
                  <input
                    readOnly
                    value={formOrder?.material ?? ""}
                    className={`${inputClass} bg-slate-50`}
                  />
                </Field>
                <Field label="Machine">
                  <input
                    readOnly
                    value={
                      machines.find((machine) => machine.name === formOrder?.machine)
                        ? `${formOrder?.machine} — ${machines.find((machine) => machine.name === formOrder?.machine)?.brand}`
                        : formOrder?.machine ?? ""
                    }
                    className={`${inputClass} bg-slate-50`}
                  />
                </Field>
                <Field label="Batch / Lot number">
                  <input
                    required
                    value={formValues.batch}
                    onChange={(event) =>
                      setFormValues({ ...formValues, batch: event.target.value })
                    }
                    placeholder="e.g. SN-261006-B"
                    className={inputClass}
                  />
                </Field>
                <Field label={`Inspection quantity (max ${maxInspectionQuantity} pcs)`}>
                  <input
                    required
                    min="0"
                    max={maxInspectionQuantity}
                    step="1"
                    type="number"
                    value={formValues.quantityInspected}
                    onChange={(event) => {
                      const quantityInspected = event.target.value;
                      const nextInspected = Number(quantityInspected);
                      const nextPassed = Math.min(
                        Number(formValues.quantityPassed || 0),
                        nextInspected,
                      );
                      setFormValues({
                        ...formValues,
                        quantityInspected,
                        quantityPassed: String(nextPassed),
                      });
                    }}
                    className={inputClass}
                  />
                </Field>
                <Field label="Passed quantity">
                  <input
                    required
                    min="0"
                    max={inspectedInput}
                    step="1"
                    type="number"
                    value={formValues.quantityPassed}
                    onChange={(event) =>
                      setFormValues({
                        ...formValues,
                        quantityPassed: event.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Rejected quantity (calculated)">
                  <input
                    readOnly
                    value={rejectedInput}
                    className={`${inputClass} bg-slate-50 font-semibold text-red-700`}
                  />
                </Field>
                <Field label="Inspector">
                  <input
                    required
                    value={formValues.inspector}
                    onChange={(event) =>
                      setFormValues({ ...formValues, inspector: event.target.value })
                    }
                    placeholder="Inspector name"
                    className={inputClass}
                  />
                </Field>
                <Field label="Inspection status">
                  <select
                    value={formValues.status}
                    onChange={(event) =>
                      setFormValues({
                        ...formValues,
                        status: event.target.value as InspectionStatus,
                      })
                    }
                    className={inputClass}
                  >
                    {inspectionStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Inspection date">
                  <input
                    required
                    type="date"
                    value={formValues.date}
                    onChange={(event) =>
                      setFormValues({ ...formValues, date: event.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Material certificate status">
                  <select
                    value={formValues.materialCertificate}
                    onChange={(event) => {
                      const materialCertificate =
                        event.target.value as InspectionInput["materialCertificate"];
                      setFormValues({
                        ...formValues,
                        materialCertificate,
                        measurements: formValues.measurements.map((measurement) =>
                          measurement.key === "certificate"
                            ? {
                                ...measurement,
                                actual: materialCertificate,
                                result:
                                  materialCertificate === "Missing" ? "FAIL" : "PASS",
                              }
                            : measurement,
                        ),
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="Verified">Verified</option>
                    <option value="Pending">Pending</option>
                    <option value="Missing">Missing</option>
                  </select>
                </Field>
                <Field label="Remarks">
                  <input
                    value={formValues.remarks}
                    onChange={(event) =>
                      setFormValues({ ...formValues, remarks: event.target.value })
                    }
                    placeholder="Inspection notes or corrective action"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                <div className="border-b bg-slate-50 px-4 py-3">
                  <h3 className="text-sm font-bold text-slate-800">
                    Dimensional & Material Quality Checks
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Dimensional checks are evaluated against tolerance. Failed criteria override a selected Passed status.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Characteristic</th>
                        <th className="px-4 py-3 font-semibold">Nominal</th>
                        <th className="px-4 py-3 font-semibold">Actual</th>
                        <th className="px-4 py-3 font-semibold">Tolerance / Standard</th>
                        <th className="px-4 py-3 font-semibold">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formValues.measurements.map((measurement) => {
                        const result = measurementResult(measurement);
                        const qualitative = ["thread", "surface", "certificate"].includes(
                          measurement.key,
                        );
                        return (
                          <tr key={measurement.key}>
                            <td className="px-4 py-3 font-medium text-slate-700">
                              {measurement.label}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                aria-label={`${measurement.label} nominal`}
                                value={measurement.nominal}
                                onChange={(event) =>
                                  updateMeasurement(
                                    measurement.key,
                                    "nominal",
                                    event.target.value,
                                  )
                                }
                                className={measurementInputClass}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                aria-label={`${measurement.label} actual`}
                                value={measurement.actual}
                                onChange={(event) =>
                                  updateMeasurement(
                                    measurement.key,
                                    "actual",
                                    event.target.value,
                                  )
                                }
                                className={measurementInputClass}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                aria-label={`${measurement.label} tolerance`}
                                value={measurement.tolerance}
                                onChange={(event) =>
                                  updateMeasurement(
                                    measurement.key,
                                    "tolerance",
                                    event.target.value,
                                  )
                                }
                                className={measurementInputClass}
                              />
                            </td>
                            <td className="px-4 py-3">
                              {qualitative ? (
                                <select
                                  aria-label={`${measurement.label} result`}
                                  value={measurement.result}
                                  onChange={(event) =>
                                    updateMeasurement(
                                      measurement.key,
                                      "result",
                                      event.target.value,
                                    )
                                  }
                                  className={`rounded-lg border-0 py-1 pl-2 pr-7 text-xs font-bold ${
                                    result === "PASS"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-red-100 text-red-700"
                                  }`}
                                  disabled={measurement.key === "certificate"}
                                >
                                  <option value="PASS">PASS</option>
                                  <option value="FAIL">FAIL</option>
                                </select>
                              ) : (
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                    result === "PASS"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-red-100 text-red-700"
                                  }`}
                                >
                                  {result}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  Pass: <strong className="text-green-700">{Math.max(0, passedInput).toLocaleString()} pcs</strong>
                  <span className="mx-2 text-slate-300">•</span>
                  Reject: <strong className="text-red-700">{rejectedInput.toLocaleString()} pcs</strong>
                  <span className="mx-2 text-slate-300">•</span>
                  Pass rate: <strong className="text-slate-800">{inspectedInput ? Math.round((passedInput / inspectedInput) * 100) : 0}%</strong>
                </p>
              </div>
              {formError && (
                <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                  {formError}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFormValues(null);
                    setEditingId(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {editingId ? "Save Inspection" : "Record Inspection"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_190px_190px_170px_170px_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              Search inspection, PO, customer, part, lot, inspector
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search quality records..."
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "All" | InspectionStatus)
              }
              className={inputClass}
            >
              <option value="All">All statuses</option>
              {inspectionStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Material</span>
            <select
              value={materialFilter}
              onChange={(event) => setMaterialFilter(event.target.value)}
              className={inputClass}
            >
              <option value="All">All materials</option>
              {[...new Set(inspections.map((record) => record.material))].map(
                (material) => (
                  <option key={material} value={material}>{material}</option>
                ),
              )}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Machine</span>
            <select
              value={machineFilter}
              onChange={(event) => setMachineFilter(event.target.value)}
              className={inputClass}
            >
              <option value="All">All machines</option>
              {machines.map((machine) => (
                <option key={machine.name} value={machine.name}>{machine.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Sort by</span>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className={inputClass}
            >
              <option value="date">Inspection date</option>
              <option value="quantity">Inspected quantity</option>
              <option value="status">Status</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setDescending((current) => !current)}
            className="self-end rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {descending ? "Descending ↓" : "Ascending ↑"}
          </button>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-1 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="text-lg font-bold">Inspection Register</h2>
              <p className="text-sm text-slate-500">
                {visibleInspections.length} of {inspections.length} quality records
              </p>
            </div>
            <p className="text-xs text-slate-400">
              Linked to live production orders and machine assignments
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-4 font-semibold">Inspection ID</th>
                  <th className="px-4 py-4 font-semibold">Date</th>
                  <th className="px-4 py-4 font-semibold">PO Number</th>
                  <th className="px-4 py-4 font-semibold">Customer</th>
                  <th className="px-4 py-4 font-semibold">Part</th>
                  <th className="px-4 py-4 font-semibold">Material</th>
                  <th className="px-4 py-4 font-semibold">Machine</th>
                  <th className="px-4 py-4 font-semibold">Batch / Lot</th>
                  <th className="px-4 py-4 text-right font-semibold">Produced</th>
                  <th className="px-4 py-4 text-right font-semibold">Inspected</th>
                  <th className="px-4 py-4 text-right font-semibold">Passed</th>
                  <th className="px-4 py-4 text-right font-semibold">Rejected</th>
                  <th className="px-4 py-4 font-semibold">Inspector</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                  <th className="px-4 py-4 font-semibold">Remarks</th>
                  <th className="px-4 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleInspections.map((record) => (
                  <tr key={record.id} className="align-top transition hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-blue-700">{record.id}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDate(record.date)}</td>
                    <td className="px-4 py-4 font-medium text-slate-700">{record.po}</td>
                    <td className="px-4 py-4 text-slate-600">{record.customer}</td>
                    <td className="px-4 py-4 font-medium text-slate-800">{record.part}</td>
                    <td className="px-4 py-4 text-slate-600">{record.material}</td>
                    <td className="px-4 py-4 text-slate-600">{record.machine}</td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-600">{record.batch}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{record.quantityProduced.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-medium tabular-nums">{record.quantityInspected.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-medium text-green-700 tabular-nums">{record.quantityPassed.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right font-medium text-red-700 tabular-nums">{record.quantityRejected.toLocaleString()}</td>
                    <td className="px-4 py-4 text-slate-600">{record.inspector}</td>
                    <td className="px-4 py-4">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="max-w-56 px-4 py-4 text-slate-600">
                      <span className="line-clamp-2">{record.remarks || "—"}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingRecord(record)}
                          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          className="rounded-md border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleInspections.length === 0 && (
                  <tr>
                    <td colSpan={16} className="px-5 py-12 text-center text-sm text-slate-500">
                      No inspection records match the selected search and filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400 sm:px-6">
            Scroll horizontally to review all inspection register fields.
          </p>
        </section>

        <footer className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="font-semibold text-slate-700">Quality Management System</p>
            <p className="text-slate-500">Tirupati Brass Industries — Inspection & QC</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-green-500" />
            System Online
          </span>
        </footer>
      </div>

      {currentViewingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewingRecord(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspection-details-title"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-3xl sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 id="inspection-details-title" className="text-xl font-bold">
                    {currentViewingRecord.id}
                  </h2>
                  <StatusBadge status={currentViewingRecord.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {currentViewingRecord.po} • {currentViewingRecord.part} • {currentViewingRecord.machine}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                aria-label="Close inspection details"
                className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 py-5 text-sm sm:grid-cols-3">
              <Detail label="Inspection date" value={formatDate(currentViewingRecord.date)} />
              <Detail label="Customer" value={currentViewingRecord.customer} />
              <Detail label="Material" value={currentViewingRecord.material} />
              <Detail label="Batch / Lot" value={currentViewingRecord.batch} />
              <Detail label="Inspector" value={currentViewingRecord.inspector} />
              <Detail label="Material certificate" value={currentViewingRecord.materialCertificate} />
              <Detail label="Quantity produced" value={`${currentViewingRecord.quantityProduced.toLocaleString()} pcs`} />
              <Detail label="Quantity inspected" value={`${currentViewingRecord.quantityInspected.toLocaleString()} pcs`} />
              <Detail label="Quantity passed" value={`${currentViewingRecord.quantityPassed.toLocaleString()} pcs`} />
              <Detail label="Quantity rejected" value={`${currentViewingRecord.quantityRejected.toLocaleString()} pcs`} />
              <Detail
                label="Pass rate"
                value={`${currentViewingRecord.quantityInspected ? Math.round((currentViewingRecord.quantityPassed / currentViewingRecord.quantityInspected) * 100) : 0}%`}
              />
              <Detail
                label="Reject rate"
                value={`${currentViewingRecord.quantityInspected ? Math.round((currentViewingRecord.quantityRejected / currentViewingRecord.quantityInspected) * 100) : 0}%`}
              />
            </dl>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-bold">Inspection measurements</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[580px] text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Characteristic</th>
                      <th className="px-4 py-3 font-semibold">Nominal</th>
                      <th className="px-4 py-3 font-semibold">Actual</th>
                      <th className="px-4 py-3 font-semibold">Tolerance</th>
                      <th className="px-4 py-3 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentViewingRecord.measurements.map((measurement) => (
                      <tr key={measurement.key}>
                        <td className="px-4 py-3 font-medium">{measurement.label}</td>
                        <td className="px-4 py-3 text-slate-600">{measurement.nominal}</td>
                        <td className="px-4 py-3 text-slate-600">{measurement.actual}</td>
                        <td className="px-4 py-3 text-slate-600">{measurement.tolerance}</td>
                        <td className="px-4 py-3">
                          <ResultBadge result={measurement.result} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Remarks</p>
              <p className="mt-1 text-sm text-slate-700">
                {currentViewingRecord.remarks || "No remarks recorded."}
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const measurementInputClass =
  "w-full min-w-28 rounded-md border border-slate-300 px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red" | "amber" | "blue";
}) {
  const valueStyles = {
    default: "text-slate-900",
    green: "text-green-600",
    red: "text-red-600",
    amber: "text-amber-600",
    blue: "text-blue-600",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
      <p className={`mt-2 text-xl font-bold sm:text-2xl ${valueStyles[tone]}`}>
        {value}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: InspectionStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

function ResultBadge({ result }: { result: MeasurementResult }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
        result === "PASS"
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      {result}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-slate-800">{value}</dd>
    </div>
  );
}
