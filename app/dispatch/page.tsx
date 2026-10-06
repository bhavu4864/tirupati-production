"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import MainNavigation from "../components/main-navigation";
import {
  cancelDispatch,
  createDispatch,
  getDispatchOrderQuantities,
  markDispatchShipped,
  setDispatchHold,
  updateDispatch,
  useDispatchRecords,
  useInspectionRecords,
  useProductionOrders,
  type DispatchInput,
  type DispatchRecord,
  type DispatchStatus,
} from "../lib/production-store";

type DispatchFormValues = {
  po: string;
  quantity: string;
  date: string;
  remarks: string;
};

type SortKey = "date" | "quantity" | "status" | "customer";

const dispatchStatuses: DispatchStatus[] = [
  "READY",
  "PARTIALLY DISPATCHED",
  "DISPATCHED",
  "HOLD",
  "CANCELLED",
];

const statusStyles: Record<DispatchStatus, string> = {
  READY: "bg-green-100 text-green-700",
  "PARTIALLY DISPATCHED": "bg-amber-100 text-amber-700",
  DISPATCHED: "bg-blue-100 text-blue-700",
  HOLD: "bg-purple-100 text-purple-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const statusRank: Record<DispatchStatus, number> = {
  READY: 0,
  "PARTIALLY DISPATCHED": 1,
  HOLD: 2,
  DISPATCHED: 3,
  CANCELLED: 4,
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(po: string): DispatchFormValues {
  return { po, quantity: "", date: today(), remarks: "" };
}

function formFromDispatch(record: DispatchRecord): DispatchFormValues {
  return {
    po: record.po,
    quantity: String(record.quantity),
    date: record.date,
    remarks: record.remarks,
  };
}

function formatDate(date: string) {
  if (!date) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DispatchPage() {
  const dispatches = useDispatchRecords();
  const orders = useProductionOrders();
  const inspections = useInspectionRecords();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | DispatchStatus>("All");
  const [orderFilter, setOrderFilter] = useState("All");
  const [customerFilter, setCustomerFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [descending, setDescending] = useState(true);
  const [formValues, setFormValues] = useState<DispatchFormValues | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DispatchRecord | null>(null);
  const [partialDispatch, setPartialDispatch] = useState<DispatchRecord | null>(
    null,
  );
  const [partialQuantity, setPartialQuantity] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const currentDispatches = dispatches;
  const readyForDispatch = orders.reduce(
    (total, order) =>
      order.status === "Cancelled"
        ? total
        : total + getDispatchOrderQuantities(order.po).availableToAllocate,
    0,
  );
  const dispatchedQuantity = currentDispatches.reduce(
    (total, dispatch) => total + dispatch.dispatchedQuantity,
    0,
  );
  const pendingDispatch = orders.reduce(
    (total, order) =>
      order.status === "Cancelled"
        ? total
        : total + getDispatchOrderQuantities(order.po).ready,
    0,
  );
  const dispatchedToday = currentDispatches
    .filter((dispatch) => dispatch.date === today())
    .reduce((total, dispatch) => total + dispatch.dispatchedQuantity, 0);

  const orderSummary = useMemo(
    () =>
      orders.map((order) => {
        const inspectionsForOrder = inspections.filter(
          (inspection) => inspection.po === order.po,
        );
        const quantityInspected = inspectionsForOrder.reduce(
          (total, inspection) => total + inspection.quantityInspected,
          0,
        );
        const quantityPassed = inspectionsForOrder.reduce(
          (total, inspection) => total + inspection.quantityPassed,
          0,
        );
        const quantityDispatched = dispatches
          .filter(
            (dispatch) => dispatch.po === order.po,
          )
          .reduce((total, dispatch) => total + dispatch.dispatchedQuantity, 0);

        return {
          ...order,
          quantityInspected,
          quantityPassed,
          quantityDispatched,
          quantityReady: Math.max(0, quantityPassed - quantityDispatched),
          availableToAllocate: getDispatchOrderQuantities(order.po).availableToAllocate,
        };
      }),
    [dispatches, inspections, orders],
  );

  const visibleDispatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = dispatches.filter((dispatch) => {
      const order = orders.find((item) => item.po === dispatch.po);
      const customer = order?.customer ?? "";
      const matchesSearch =
        !query ||
        [dispatch.id, dispatch.po, customer, order?.part ?? "", order?.material ?? ""]
          .some((value) => value.toLowerCase().includes(query));
      return (
        matchesSearch &&
        (statusFilter === "All" || dispatch.status === statusFilter) &&
        (orderFilter === "All" || dispatch.po === orderFilter) &&
        (customerFilter === "All" || customer === customerFilter) &&
        (!dateFrom || dispatch.date >= dateFrom) &&
        (!dateTo || dispatch.date <= dateTo)
      );
    });

    return filtered.sort((left, right) => {
      const leftOrder = orders.find((order) => order.po === left.po);
      const rightOrder = orders.find((order) => order.po === right.po);
      let compare = 0;
      if (sortKey === "date") compare = left.date.localeCompare(right.date);
      if (sortKey === "quantity") compare = left.quantity - right.quantity;
      if (sortKey === "status") {
        compare = statusRank[left.status] - statusRank[right.status];
      }
      if (sortKey === "customer") {
        compare = (leftOrder?.customer ?? "").localeCompare(
          rightOrder?.customer ?? "",
        );
      }
      return descending ? -compare : compare;
    });
  }, [
    customerFilter,
    dateFrom,
    dateTo,
    descending,
    dispatches,
    orderFilter,
    orders,
    search,
    sortKey,
    statusFilter,
  ]);

  const editingDispatch = formValues
    ? dispatches.find((dispatch) => dispatch.id === editingId)
    : undefined;
  const formOrder = formValues
    ? orders.find((order) => order.po === formValues.po)
    : undefined;
  const formSummary = formOrder
    ? getDispatchOrderQuantities(formOrder.po)
    : undefined;
  const existingAllocation =
    editingDispatch &&
    editingDispatch.po === formValues?.po &&
    editingDispatch.status !== "CANCELLED"
      ? editingDispatch.quantity - editingDispatch.dispatchedQuantity
      : 0;
  const maxDispatchQuantity =
    (formSummary?.availableToAllocate ?? 0) +
    existingAllocation +
    (editingDispatch && editingDispatch.po === formValues?.po
      ? editingDispatch.dispatchedQuantity
      : 0);

  function openNewDispatch() {
    const availableOrder = orderSummary.find(
      (order) =>
        order.status !== "Cancelled" && order.availableToAllocate > 0,
    );
    setEditingId(null);
    setFormValues(emptyForm(availableOrder?.po ?? ""));
    setFormError("");
    setNotice("");
  }

  function openEditDispatch(dispatch: DispatchRecord) {
    setEditingId(dispatch.id);
    setFormValues(formFromDispatch(dispatch));
    setFormError("");
    setNotice("");
  }

  async function submitDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formValues) return;
    const input: DispatchInput = {
      po: formValues.po,
      quantity: Number(formValues.quantity),
      date: formValues.date,
      remarks: formValues.remarks.trim(),
    };
    const result = editingId
      ? await updateDispatch(editingId, input)
      : await createDispatch(input);
    if (!result.success) {
      setFormError(result.error ?? "Dispatch could not be saved.");
      return;
    }
    setNotice(
      editingId
        ? `Dispatch ${editingId} updated.`
        : `Dispatch ${"id" in result ? result.id : ""} created and ready.`,
    );
    setFormValues(null);
    setEditingId(null);
    setFormError("");
  }

  async function markShipped(dispatch: DispatchRecord, quantity?: number) {
    const quantityToShip = quantity ?? dispatch.quantity - dispatch.dispatchedQuantity;
    if (
      !window.confirm(
        `Confirm dispatch of ${quantityToShip.toLocaleString()} pcs for ${dispatch.po}?`,
      )
    ) {
      return;
    }
    const result = await markDispatchShipped(dispatch.id, quantity);
    if (!result.success) {
      window.alert(result.error ?? "Dispatch could not be completed.");
      return;
    }
    setNotice(`${quantityToShip.toLocaleString()} pcs marked as dispatched.`);
    setPartialDispatch(null);
    setPartialQuantity("");
  }

  async function holdDispatch(dispatch: DispatchRecord, hold: boolean) {
    const result = await setDispatchHold(dispatch.id, hold);
    if (!result.success) {
      window.alert(result.error ?? "Dispatch status could not be updated.");
      return;
    }
    setNotice(
      hold
        ? `Dispatch ${dispatch.id} placed on hold.`
        : `Dispatch ${dispatch.id} released from hold.`,
    );
  }

  async function cancel(dispatch: DispatchRecord) {
    if (
      !window.confirm(
        `Cancel the remaining quantity on dispatch ${dispatch.id} for ${dispatch.po}? Any quantity already shipped will remain in the dispatch totals.`,
      )
    ) {
      return;
    }
    const result = await cancelDispatch(dispatch.id);
    if (!result.success) {
      window.alert(result.error ?? "Dispatch could not be cancelled.");
      return;
    }
    setNotice(`Dispatch ${dispatch.id} cancelled.`);
  }

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
            <p className="hidden text-sm text-slate-400 sm:block">
              Production Status
            </p>
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
              Dispatch Management
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Finished CNC components released against quality-approved quantities
            </p>
          </div>
          <button
            type="button"
            onClick={openNewDispatch}
            className="inline-flex w-fit items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <span aria-hidden="true" className="mr-2 text-lg leading-none">+</span>
            Create Dispatch
          </button>
        </div>

        <section
          aria-label="Dispatch summary"
          className="grid grid-cols-2 gap-4 md:grid-cols-4"
        >
          <Kpi label="Ready for Dispatch" value={`${readyForDispatch.toLocaleString()} pcs`} tone="green" />
          <Kpi label="Dispatched Quantity" value={`${dispatchedQuantity.toLocaleString()} pcs`} tone="blue" />
          <Kpi label="Pending Dispatch" value={`${pendingDispatch.toLocaleString()} pcs`} tone="amber" />
          <Kpi label="Today's Dispatch" value={`${dispatchedToday.toLocaleString()} pcs`} tone="blue" />
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

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-bold">Order Dispatch Readiness</h2>
            <p className="mt-1 text-sm text-slate-500">
              Only accepted QC quantities are available for shipment
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="mobile-card-table mobile-card-table--dispatch-readiness w-full min-w-[1150px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Order / Customer</th>
                  <th className="px-5 py-4 font-semibold">Part / Material</th>
                  <th className="px-5 py-4 font-semibold">Machine</th>
                  <th className="px-5 py-4 text-right font-semibold">Ordered</th>
                  <th className="px-5 py-4 text-right font-semibold">Produced</th>
                  <th className="px-5 py-4 text-right font-semibold">QC Passed</th>
                  <th className="px-5 py-4 text-right font-semibold">Ready to Dispatch</th>
                  <th className="px-5 py-4 text-right font-semibold">Dispatched</th>
                  <th className="px-5 py-4 text-right font-semibold">Order Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderSummary.map((order) => (
                  <tr key={order.po} className="transition hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-blue-700">{order.po}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{order.customer}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{order.part}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{order.material}</p>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-700">{order.machine}</td>
                    <td className="px-5 py-4 text-right tabular-nums">{order.target.toLocaleString()}</td>
                    <td className="px-5 py-4 text-right tabular-nums">{order.produced.toLocaleString()}</td>
                    <td className="px-5 py-4 text-right font-medium text-green-700 tabular-nums">{order.quantityPassed.toLocaleString()}</td>
                    <td className="px-5 py-4 text-right font-semibold text-green-700 tabular-nums">{order.quantityReady.toLocaleString()}</td>
                    <td className="px-5 py-4 text-right font-medium text-blue-700 tabular-nums">{order.quantityDispatched.toLocaleString()}</td>
                    <td className="px-5 py-4 text-right font-semibold text-orange-600 tabular-nums">
                      {Math.max(0, order.target - order.quantityDispatched).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {formValues && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">
                  {editingId ? `Edit Dispatch ${editingId}` : "Create Dispatch"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  The quantity is reserved from the QC-passed balance for the selected order.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormValues(null)}
                aria-label="Close dispatch form"
                className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            <form onSubmit={submitDispatch}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Order number">
                  <select
                    required
                    value={formValues.po}
                    onChange={(event) =>
                      setFormValues({ ...formValues, po: event.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="" disabled>Select order</option>
                    {orderSummary
                      .filter(
                        (order) =>
                          order.status !== "Cancelled" &&
                          (order.availableToAllocate > 0 ||
                            (editingDispatch?.po === order.po)),
                      )
                      .map((order) => (
                        <option key={order.po} value={order.po}>
                          {order.po} — {order.customer} — {order.part}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Customer">
                  <input
                    readOnly
                    value={formOrder?.customer ?? ""}
                    className={`${inputClass} bg-slate-50`}
                  />
                </Field>
                <Field label="Part / Material">
                  <input
                    readOnly
                    value={formOrder ? `${formOrder.part} — ${formOrder.material}` : ""}
                    className={`${inputClass} bg-slate-50`}
                  />
                </Field>
                <Field label={`Dispatch quantity (max ${maxDispatchQuantity} pcs)`}>
                  <input
                    required
                    type="number"
                    min={editingDispatch?.dispatchedQuantity ?? 1}
                    max={maxDispatchQuantity}
                    step="1"
                    value={formValues.quantity}
                    onChange={(event) =>
                      setFormValues({ ...formValues, quantity: event.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Dispatch date">
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
                <Field label="Remarks / packing note">
                  <input
                    value={formValues.remarks}
                    onChange={(event) =>
                      setFormValues({ ...formValues, remarks: event.target.value })
                    }
                    placeholder="Packing, vehicle, or delivery note"
                    className={inputClass}
                  />
                </Field>
              </div>
              {formOrder && formSummary && (
                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  QC passed: <strong className="text-green-700">{formSummary.qcPassed.toLocaleString()} pcs</strong>
                  <span className="mx-2 text-slate-300">•</span>
                  Dispatched: <strong className="text-blue-700">{formSummary.dispatched.toLocaleString()} pcs</strong>
                  <span className="mx-2 text-slate-300">•</span>
                  Not yet allocated: <strong className="text-slate-800">{formSummary.availableToAllocate.toLocaleString()} pcs</strong>
                </div>
              )}
              {formError && (
                <p role="alert" className="mt-4 text-sm font-medium text-red-600">
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
                  {editingId ? "Save Changes" : "Create Dispatch"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,1fr))_minmax(250px,1.5fr)]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              Search dispatch, order, customer, part
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search dispatch history..."
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "All" | DispatchStatus)
              }
              className={inputClass}
            >
              <option value="All">All statuses</option>
              {dispatchStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Order</span>
            <select
              value={orderFilter}
              onChange={(event) => setOrderFilter(event.target.value)}
              className={inputClass}
            >
              <option value="All">All orders</option>
              {orders.map((order) => (
                <option key={order.po} value={order.po}>{order.po}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Customer</span>
            <select
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
              className={inputClass}
            >
              <option value="All">All customers</option>
              {[...new Set(orders.map((order) => order.customer))].map((customer) => (
                <option key={customer} value={customer}>{customer}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">From date</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">To date</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className={inputClass}
            />
          </label>
          <div className="flex min-w-0 items-end gap-2 sm:col-span-2 xl:col-span-1">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Sort by</span>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className={inputClass}
              >
                <option value="date">Dispatch date</option>
                <option value="quantity">Quantity</option>
                <option value="status">Status</option>
                <option value="customer">Customer</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setDescending((current) => !current)}
              className="shrink-0 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {descending ? "Descending ↓" : "Ascending ↑"}
            </button>
          </div>
        </section>

        {partialDispatch && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="partial-dispatch-title"
              className="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl sm:p-6"
            >
              <h2 id="partial-dispatch-title" className="text-lg font-bold">
                Partial Dispatch
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {partialDispatch.id} • {partialDispatch.po} •{" "}
                {partialDispatch.quantity - partialDispatch.dispatchedQuantity} pcs remaining
              </p>
              <label className="mt-5 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">
                  Quantity to dispatch now
                </span>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  max={partialDispatch.quantity - partialDispatch.dispatchedQuantity}
                  step="1"
                  value={partialQuantity}
                  onChange={(event) => setPartialQuantity(event.target.value)}
                  className={inputClass}
                />
              </label>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPartialDispatch(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => markShipped(partialDispatch, Number(partialQuantity))}
                  disabled={!partialQuantity}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirm Partial Dispatch
                </button>
              </div>
            </section>
          </div>
        )}

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-1 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="text-lg font-bold">Dispatch History</h2>
              <p className="text-sm text-slate-500">
                {visibleDispatches.length} of {dispatches.length} dispatch records
              </p>
            </div>
            <p className="text-xs text-slate-400">
              Shipment quantity is restricted to QC-passed available stock
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="mobile-card-table mobile-card-table--dispatch-register w-full min-w-[1950px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-4 font-semibold">Dispatch ID</th>
                  <th className="px-4 py-4 font-semibold">Order / Customer</th>
                  <th className="px-4 py-4 font-semibold">Part / Material</th>
                  <th className="px-4 py-4 font-semibold">Machine</th>
                  <th className="px-4 py-4 text-right font-semibold">Ordered</th>
                  <th className="px-4 py-4 text-right font-semibold">Produced</th>
                  <th className="px-4 py-4 text-right font-semibold">Inspected</th>
                  <th className="px-4 py-4 text-right font-semibold">QC Passed</th>
                  <th className="px-4 py-4 text-right font-semibold">Ready for Dispatch</th>
                  <th className="px-4 py-4 text-right font-semibold">Dispatched</th>
                  <th className="px-4 py-4 text-right font-semibold">Balance</th>
                  <th className="px-4 py-4 font-semibold">Dispatch Date</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                  <th className="px-4 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleDispatches.map((dispatch) => {
                  const order = orders.find((item) => item.po === dispatch.po);
                  const summary = order
                    ? getDispatchOrderQuantities(order.po)
                    : { qcPassed: 0, dispatched: 0, ready: 0, availableToAllocate: 0 };
                  const orderInspected = inspections
                    .filter((inspection) => inspection.po === dispatch.po)
                    .reduce((total, inspection) => total + inspection.quantityInspected, 0);
                  const remaining =
                    dispatch.status === "CANCELLED"
                      ? 0
                      : Math.max(
                          0,
                          dispatch.quantity - dispatch.dispatchedQuantity,
                        );
                  const canEdit =
                    dispatch.status !== "CANCELLED" &&
                    dispatch.status !== "DISPATCHED" &&
                    dispatch.dispatchedQuantity === 0;

                  return (
                    <tr key={dispatch.id} className="align-top transition hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-blue-700">{dispatch.id}</td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-800">{dispatch.po}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{order?.customer ?? "Order unavailable"}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-800">{order?.part ?? "—"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{order?.material ?? "—"}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{order?.machine ?? "—"}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{order?.target.toLocaleString() ?? "—"}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{order?.produced.toLocaleString() ?? "—"}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{orderInspected.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right font-medium text-green-700 tabular-nums">{summary.qcPassed.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right font-semibold text-green-700 tabular-nums">{summary.ready.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right font-medium text-blue-700 tabular-nums">{summary.dispatched.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right font-semibold text-orange-600 tabular-nums">{remaining.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDate(dispatch.date)}</td>
                      <td className="px-4 py-4"><StatusBadge status={dispatch.status} /></td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingRecord(dispatch)}
                            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                          >
                            View
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEditDispatch(dispatch)}
                              className="rounded-md border border-blue-200 px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            >
                              Edit
                            </button>
                          )}
                          {remaining > 0 &&
                            dispatch.status !== "HOLD" &&
                            dispatch.status !== "CANCELLED" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => markShipped(dispatch)}
                                  className="rounded-md bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                >
                                  Mark Dispatched
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPartialDispatch(dispatch);
                                    setPartialQuantity("");
                                  }}
                                  className="rounded-md border border-blue-200 px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                                >
                                  Partial
                                </button>
                              </>
                            )}
                          {dispatch.status === "HOLD" && (
                            <button
                              type="button"
                              onClick={() => holdDispatch(dispatch, false)}
                              className="rounded-md border border-purple-200 px-2 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                            >
                              Release Hold
                            </button>
                          )}
                          {(dispatch.status === "READY" ||
                            dispatch.status === "PARTIALLY DISPATCHED") && (
                            <button
                              type="button"
                              onClick={() => holdDispatch(dispatch, true)}
                              className="rounded-md border border-amber-200 px-2 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                            >
                              Hold
                            </button>
                          )}
                          {dispatch.status !== "CANCELLED" &&
                            dispatch.status !== "DISPATCHED" && (
                              <button
                                type="button"
                                onClick={() => cancel(dispatch)}
                                className="rounded-md border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                              >
                                Cancel
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleDispatches.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-5 py-12 text-center text-sm text-slate-500">
                      No dispatch records match the selected search and filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400 sm:px-6">
            <span className="hidden md:inline">Scroll horizontally to see all order, QC, dispatch, and action details.</span>
            <span className="md:hidden">Use the filters to narrow records and review each dispatch card.</span>
          </p>
        </section>

        <footer className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="font-semibold text-slate-700">Production System</p>
            <p className="text-slate-500">Tirupati Brass Industries — Dispatch Control</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-green-500" />
            System Online
          </span>
        </footer>
      </div>

      {viewingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewingRecord(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dispatch-details-title"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-2xl sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 id="dispatch-details-title" className="text-xl font-bold">
                    {viewingRecord.id}
                  </h2>
                  <StatusBadge status={viewingRecord.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{viewingRecord.po}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                aria-label="Close dispatch details"
                className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            {(() => {
              const order = orders.find((item) => item.po === viewingRecord.po);
              const summary = getDispatchOrderQuantities(viewingRecord.po);
              return (
                <dl className="grid grid-cols-2 gap-x-5 gap-y-4 py-5 text-sm sm:grid-cols-3">
                  <Detail label="Customer" value={order?.customer ?? "—"} />
                  <Detail label="Part" value={order?.part ?? "—"} />
                  <Detail label="Material" value={order?.material ?? "—"} />
                  <Detail label="Machine" value={order?.machine ?? "—"} />
                  <Detail label="Quantity ordered" value={`${order?.target.toLocaleString() ?? "0"} pcs`} />
                  <Detail label="Quantity produced" value={`${order?.produced.toLocaleString() ?? "0"} pcs`} />
                  <Detail label="QC-passed quantity" value={`${summary.qcPassed.toLocaleString()} pcs`} />
                  <Detail label="This dispatch allocation" value={`${viewingRecord.quantity.toLocaleString()} pcs`} />
                  <Detail label="Dispatched on this record" value={`${viewingRecord.dispatchedQuantity.toLocaleString()} pcs`} />
                  <Detail label="Ready for dispatch" value={`${summary.ready.toLocaleString()} pcs`} />
                  <Detail label="Dispatch balance" value={`${Math.max(0, viewingRecord.quantity - viewingRecord.dispatchedQuantity).toLocaleString()} pcs`} />
                  <Detail label="Dispatch date" value={formatDate(viewingRecord.date)} />
                </dl>
              );
            })()}
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Remarks / packing note</p>
              <p className="mt-1 text-sm text-slate-700">
                {viewingRecord.remarks || "No remarks recorded."}
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

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "blue" | "amber";
}) {
  const valueStyle = {
    default: "text-slate-900",
    green: "text-green-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
      <p className={`mt-2 text-xl font-bold sm:text-2xl ${valueStyle}`}>{value}</p>
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

function StatusBadge({ status }: { status: DispatchStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>
      {status}
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
