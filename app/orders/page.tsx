"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import MainNavigation from "../components/main-navigation";
import { useAuth } from "../components/auth-provider";
import {
  cancelDispatch,
  createDispatch,
  getDispatchOrderQuantities,
  markDispatchShipped,
  useProductionOrders,
} from "../lib/production-store";

const priorities = ["Normal", "High", "Urgent"] as const;
const statuses = [
  "Pending",
  "Processing",
  "Packing",
  "Partial Delivery",
  "Fully Dispatched",
] as const;

type OrderPriority = (typeof priorities)[number];
type OrderStatus = (typeof statuses)[number];
type CustomerOrder = {
  id: string;
  companyName: string;
  poNumber: string;
  orderBy: "Email" | "WhatsApp";
  itemName: string;
  material: string;
  quantity: number;
  rate: number;
  purchaseDate: string;
  dueDate: string;
  priority: OrderPriority;
  status: OrderStatus;
  dispatchedQuantity: number;
  remainingQuantity: number;
  dispatchRecordCount: number;
};
type OrderDraft = Omit<
  CustomerOrder,
  "id" | "dispatchedQuantity" | "remainingQuantity" | "dispatchRecordCount"
>;

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const emptyOrder = (): OrderDraft => ({
  companyName: "",
  poNumber: "",
  orderBy: "Email",
  itemName: "",
  material: "",
  quantity: 1,
  rate: 0,
  purchaseDate: today(),
  dueDate: "",
  priority: "Normal",
  status: "Pending",
});

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "The request could not be completed.";
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN");
}

export default function OrdersPage() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN";
  const productionOrders = useProductionOrders();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [dispatchNow, setDispatchNow] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const result = await response.json() as { orders: CustomerOrder[] };
      setOrders(result.orders);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOrders(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOrders]);

  function openNewOrder() {
    setDraft(emptyOrder());
    setDispatchNow("");
    setEditingId(null);
    setError("");
    setMessage("");
  }

  function openEditOrder(order: CustomerOrder) {
    setDraft({
      companyName: order.companyName,
      poNumber: order.poNumber,
      orderBy: order.orderBy,
      itemName: order.itemName,
      material: order.material,
      quantity: order.quantity,
      rate: order.rate,
      purchaseDate: order.purchaseDate,
      dueDate: order.dueDate,
      priority: order.priority,
      status: order.status,
    });
    setDispatchNow("");
    setEditingId(order.id);
    setError("");
    setMessage("");
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    if (draft.dueDate < draft.purchaseDate) {
      setError("Due / Dispatch Date cannot be before Purchase Date.");
      return;
    }
    const isDispatchAction =
      draft.status === "Partial Delivery" || draft.status === "Fully Dispatched";
    const editedOrder = editingId
      ? orders.find((order) => order.id === editingId)
      : undefined;
    const linkedProductionOrder = editedOrder
      ? productionOrders.find(
          (order) => order.po.toLowerCase() === editedOrder.poNumber.toLowerCase(),
        )
      : undefined;
    const dispatchQuantity = draft.status === "Fully Dispatched"
      ? editedOrder?.remainingQuantity ?? 0
      : Number(dispatchNow);

    if (isDispatchAction) {
      if (!editedOrder || !linkedProductionOrder) {
        setError("This order has no matching production order, so a dispatch cannot be recorded.");
        return;
      }
      if (!Number.isInteger(dispatchQuantity) || dispatchQuantity <= 0) {
        setError(draft.status === "Partial Delivery"
          ? "Enter a positive whole-number quantity to dispatch."
          : "This order has no remaining quantity to dispatch.");
        return;
      }
      if (dispatchQuantity > editedOrder.remainingQuantity) {
        setError(`Dispatch quantity cannot exceed the remaining ${editedOrder.remainingQuantity.toLocaleString()} PCS.`);
        return;
      }
      const dispatchCapacity = getDispatchOrderQuantities(linkedProductionOrder.po);
      if (dispatchQuantity > dispatchCapacity.availableToAllocate) {
        setError(`Only ${dispatchCapacity.availableToAllocate.toLocaleString()} PCS are currently available from QC-passed, unallocated production.`);
        return;
      }
      if (!window.confirm(
        `Dispatch ${dispatchQuantity.toLocaleString()} PCS for ${editedOrder.poNumber}?`,
      )) {
        return;
      }
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const orderToSave = isDispatchAction
        ? {
            ...draft,
            status: editedOrder && ["Pending", "Processing", "Packing"].includes(editedOrder.status)
              ? editedOrder.status
              : "Packing",
          }
        : draft;
      const response = await fetch(
        editingId ? `/api/orders/${encodeURIComponent(editingId)}` : "/api/orders",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderToSave),
        },
      );
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      if (isDispatchAction && editedOrder && linkedProductionOrder) {
        const created = await createDispatch({
          po: linkedProductionOrder.po,
          quantity: dispatchQuantity,
          date: today(),
          remarks: `Order Management ${draft.status.toLowerCase()}`,
        });
        if (!created.success || !created.id) {
          setError(created.error ?? "Dispatch record could not be created.");
          await loadOrders();
          return;
        }
        const shipped = await markDispatchShipped(created.id, dispatchQuantity);
        if (!shipped.success) {
          const cancelled = await cancelDispatch(created.id);
          setError(cancelled.success
            ? shipped.error ?? "Dispatch could not be completed; its unused allocation was cancelled."
            : `${shipped.error ?? "Dispatch could not be completed."} The unused dispatch allocation could not be cancelled; review Dispatch History.`);
          await loadOrders();
          return;
        }
      }
      setMessage(editingId ? "Order updated." : "Order created.");
      setDraft(null);
      setEditingId(null);
      await loadOrders();
    } catch {
      setError("Unable to save the order.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder(order: CustomerOrder) {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    if (
      order.dispatchRecordCount > 0 &&
      !window.confirm(
        `This order has ${order.dispatchedQuantity.toLocaleString()} PCS dispatched across ${order.dispatchRecordCount} dispatch record(s). Deleting it removes the order from Order Management, but preserves all dispatch history. Continue?`,
      )
    ) {
      return;
    }

    setDeletingId(order.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      setMessage(
        order.dispatchRecordCount > 0
          ? "Order deleted. Its dispatch records remain in Dispatch History."
          : "Order deleted.",
      );
      if (editingId === order.id) {
        setDraft(null);
        setEditingId(null);
      }
      await loadOrders();
    } catch {
      setError("Unable to delete the order.");
    } finally {
      setDeletingId(null);
    }
  }

  const activeOrders = orders.filter((order) => order.status !== "Fully Dispatched");
  const inputClass = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-950 px-4 py-4 text-white sm:px-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-lg font-bold tracking-tight sm:text-2xl">TIRUPATI BRASS INDUSTRIES</p>
          <p className="text-xs text-slate-400 sm:text-sm">Order Management</p>
        </div>
      </header>
      <MainNavigation />
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Order Management</h1>
          {canManage && (
            <button type="button" onClick={openNewOrder} className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white">
              New Order
            </button>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p>}

        {draft && canManage && (
          <form onSubmit={saveOrder} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium">Company Name<input required maxLength={160} value={draft.companyName} onChange={(event) => setDraft({ ...draft, companyName: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-medium">PO Number<input required maxLength={120} value={draft.poNumber} onChange={(event) => setDraft({ ...draft, poNumber: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-medium">Order By<select value={draft.orderBy} onChange={(event) => setDraft({ ...draft, orderBy: event.target.value as OrderDraft["orderBy"] })} className={inputClass}><option>Email</option><option>WhatsApp</option></select></label>
            <label className="text-sm font-medium">Item Name<input required maxLength={160} value={draft.itemName} onChange={(event) => setDraft({ ...draft, itemName: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-medium">Material<input required maxLength={160} value={draft.material} onChange={(event) => setDraft({ ...draft, material: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-medium">Quantity<input required type="number" min="1" step="1" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} className={inputClass} /></label>
            <label className="text-sm font-medium">Rate<input required type="number" min="0" step="0.01" value={draft.rate} onChange={(event) => setDraft({ ...draft, rate: Number(event.target.value) })} className={inputClass} /></label>
            <label className="text-sm font-medium">Purchase Date<input required type="date" value={draft.purchaseDate} max={draft.dueDate || undefined} onChange={(event) => setDraft({ ...draft, purchaseDate: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-medium">Due / Dispatch Date<input required type="date" value={draft.dueDate} min={draft.purchaseDate || undefined} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} className={inputClass} /></label>
            <label className="text-sm font-medium">Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as OrderPriority })} className={inputClass}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
            <label className="text-sm font-medium">
              Status
              <select
                value={draft.status}
                onChange={(event) => {
                  const status = event.target.value as OrderStatus;
                  setDraft({ ...draft, status });
                  if (status === "Partial Delivery") setDispatchNow("");
                }}
                className={`${inputClass} cursor-pointer focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200`}
              >
                {statuses.map((status) => (
                  <option
                    key={status}
                    disabled={!editingId && (status === "Partial Delivery" || status === "Fully Dispatched")}
                  >
                    {status}
                  </option>
                ))}
              </select>
            </label>
            {draft.status === "Partial Delivery" && editingId && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium">
                  Quantity to dispatch now (PCS)
                  <input
                    required
                    type="number"
                    min="1"
                    max={orders.find((order) => order.id === editingId)?.remainingQuantity ?? undefined}
                    step="1"
                    inputMode="numeric"
                    value={dispatchNow}
                    onChange={(event) => setDispatchNow(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <p className="mt-2 text-sm text-slate-700">
                  Dispatched after this dispatch:{" "}
                  <strong>{((orders.find((order) => order.id === editingId)?.dispatchedQuantity ?? 0) + Number(dispatchNow || 0)).toLocaleString()} PCS</strong>
                  <span className="mx-2 text-slate-400">·</span>
                  Remaining after this dispatch:{" "}
                  <strong>{Math.max(0, (orders.find((order) => order.id === editingId)?.remainingQuantity ?? 0) - Number(dispatchNow || 0)).toLocaleString()} PCS</strong>
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Dispatches are limited to the matching production order&apos;s QC-passed, unallocated quantity.
                </p>
              </div>
            )}
            {draft.status === "Fully Dispatched" && editingId && (
              <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 sm:col-span-2 lg:col-span-3">
                Saving will dispatch the remaining{" "}
                <strong>{(orders.find((order) => order.id === editingId)?.remainingQuantity ?? 0).toLocaleString()} PCS</strong>.
                Dispatching is subject to available QC-passed production.
              </p>
            )}
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : editingId ? "Save Order" : "Create Order"}</button>
              <button type="button" onClick={() => { setDraft(null); setEditingId(null); }} className="min-h-11 rounded-lg border border-slate-300 px-4 font-medium">Cancel</button>
            </div>
          </form>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-200 px-4 py-3 text-lg font-semibold">Orders</h2>
          {loading ? <p className="p-4 text-sm text-slate-500">Loading orders…</p> :
            activeOrders.length === 0 ? <p className="p-4 text-sm text-slate-500">{orders.length > 0 ? "All orders are fully dispatched." : "No orders yet."}</p> :
              <div className="divide-y divide-slate-200">
                {activeOrders.map((order) => (
                  <article key={order.id} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{order.companyName}</h3>
                        <p className="break-words text-sm text-slate-600">PO: {order.poNumber} · {order.itemName}</p>
                        <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          order.status === "Fully Dispatched"
                            ? "bg-green-100 text-green-700"
                            : order.status === "Partial Delivery"
                              ? "bg-amber-100 text-amber-800"
                              : order.status === "Packing"
                                ? "bg-purple-100 text-purple-700"
                                : order.status === "Processing"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-slate-100 text-slate-700"
                        }`}>{order.status}</span>
                      </div>
                      {canManage && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => openEditOrder(order)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium">Edit</button>
                          <button type="button" onClick={() => void deleteOrder(order)} disabled={deletingId === order.id} className="min-h-11 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-700 disabled:opacity-60">{deletingId === order.id ? "Deleting…" : "Delete"}</button>
                        </div>
                      )}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
                      <OrderValue label="Company" value={order.companyName} />
                      <OrderValue label="PO Number" value={order.poNumber} />
                      <OrderValue label="Item" value={order.itemName} />
                      <OrderValue label="Order By" value={order.orderBy} />
                      <OrderValue label="Ordered Qty" value={`${order.quantity.toLocaleString()} PCS`} />
                      <OrderValue label="Dispatched Qty" value={`${order.dispatchedQuantity.toLocaleString()} PCS`} />
                      <OrderValue label="Remaining Qty" value={`${order.remainingQuantity.toLocaleString()} PCS`} />
                      <OrderValue label="Rate" value={`₹${order.rate.toFixed(2)}`} />
                      <OrderValue label="Material" value={order.material} />
                      <OrderValue label="Purchase Date" value={formatDate(order.purchaseDate)} />
                      <OrderValue label="Dispatch Date" value={formatDate(order.dueDate)} />
                      <OrderValue label="Priority" value={order.priority} />
                    </dl>
                  </article>
                ))}
              </div>}
        </section>
      </div>
    </main>
  );
}

function OrderValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="break-words font-medium">{value}</dd></div>;
}
