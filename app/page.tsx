"use client";

import MainNavigation from "./components/main-navigation";
import {
  useProductionActivity,
  useProductionMachines,
  useProductionOrders,
  useProductionSummary,
} from "./lib/production-store";

const orderCustomers: Record<string, string> = {
  "PO-1025": "Forbes Marshall",
  "PO-1026": "Inoxpa India",
  "PO-1027": "Horbiger India",
};

const orderDeliveries: Record<string, string> = {
  "PO-1025": "08 Oct 2026",
  "PO-1026": "10 Oct 2026",
  "PO-1027": "07 Oct 2026",
};

function formatActivityTime(timestamp: number) {
  if (timestamp === 0) return "Shift opening";

  return new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const machines = useProductionMachines();
  const productionOrders = useProductionOrders();
  const activities = useProductionActivity();
  const summary = useProductionSummary();

  const orders = productionOrders.map((order) => ({
    po: order.po,
    customer: order.customer || orderCustomers[order.po] || "Unassigned",
    part: order.part,
    qty: order.target,
    produced: order.produced,
    dispatchQuantity: order.dispatchQuantity ?? 0,
    delivery: order.dueDate
      ? new Date(`${order.dueDate}T00:00:00`).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : orderDeliveries[order.po] ?? "To be confirmed",
    status: order.status,
  }));

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      {/* Header */}
      <header className="bg-slate-950 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              TIRUPATI BRASS INDUSTRIES
            </h1>
            <p className="text-slate-400 text-sm">
              CNC Production Control • Jamnagar
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm text-slate-400">Production Status</p>
            <p className="text-green-400 font-semibold">● SYSTEM ONLINE</p>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <MainNavigation />

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Page title */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-slate-500">Live overview of your factory production.</p>
        </div>

        {/* KPI Cards */}
        <section className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Kpi
            title="Today's Total Production"
            value={`${summary.totalProduced.toLocaleString()} pcs`}
            tone="green"
          />
          <Kpi
            title="Total Production Target"
            value={`${summary.totalTarget.toLocaleString()} pcs`}
          />
          <Kpi
            title="Remaining Production"
            value={`${summary.remainingProduction.toLocaleString()} pcs`}
            tone="orange"
          />
          <Kpi
            title="Active CNC Machines"
            value={`${summary.activeMachines} / ${summary.machineCount}`}
            tone="green"
          />
          <Kpi title="Idle Machines" value={summary.idleMachines} tone="orange" />
          <Kpi title="Dispatched Qty" value={`${summary.totalDispatched.toLocaleString()} pcs`} tone="blue" />
          <Kpi title="Total WIP" value={`${summary.totalWip.toLocaleString()} pcs`} />
          <Kpi title="Orders in Progress" value={summary.ordersInProgress} tone="blue" />
          <Kpi
            title="Overall Machine Utilization"
            value={`${summary.machineUtilization}%`}
            tone="blue"
          />
        </section>

        {/* CNC Machines */}
        <section className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">Live CNC Production</h3>
            <span className="text-sm text-slate-500">
              Updated just now
            </span>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {machines.map((machine) => {
              const balance = Math.max(0, machine.target - machine.produced);
              const efficiency = machine.target
                ? Math.min(
                    100,
                    Math.round((machine.produced / machine.target) * 100),
                  )
                : 0;

              return (
                <div
                  key={machine.name}
                  className="bg-white rounded-xl border shadow-sm p-5"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-xl font-bold">{machine.name}</h4>
                      <p className="text-sm text-slate-500">
                        {machine.brand} <span className="text-slate-300">•</span>{" "}
                        {machine.part}
                      </p>
                    </div>

                    <Status status={machine.status} />
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Order</span>
                      <b>{machine.order}</b>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Target</span>
                      <b>{machine.target.toLocaleString()} pcs</b>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Produced</span>
                      <b>{machine.produced.toLocaleString()} pcs</b>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Balance</span>
                      <b>{balance.toLocaleString()} pcs</b>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Material</span>
                      <b>{machine.material}</b>
                    </div>

                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span>Production</span>
                      <span>{efficiency}%</span>
                    </div>

                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: `${efficiency}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Efficiency</span>
                    <span className="font-semibold text-slate-700">
                      {efficiency}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-8 rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h3 className="text-lg font-bold">Recent Production Activity</h3>
              <p className="text-sm text-slate-500">
                Latest machine status and output updates
              </p>
            </div>
            <span className="hidden items-center gap-2 text-xs font-medium text-green-700 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Live
            </span>
          </div>

          <ul className="divide-y divide-slate-100">
            {activities.slice(0, 6).map((activity) => (
              <li
                key={activity.id}
                className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {activity.machine}
                      <span className="mx-2 text-slate-300">•</span>
                      {activity.message}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Order {activity.order}
                    </p>
                  </div>
                </div>
                <time
                  dateTime={
                    activity.createdAt
                      ? new Date(activity.createdAt).toISOString()
                      : undefined
                  }
                  className="pl-5 text-xs text-slate-400 sm:pl-0"
                >
                  {formatActivityTime(activity.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        </section>

        {/* Orders */}
        <section className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="text-lg font-bold">Production Orders</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="mobile-card-table mobile-card-table--dashboard w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-4">PO</th>
                  <th className="text-left p-4">Customer</th>
                  <th className="text-left p-4">Part</th>
                  <th className="text-right p-4">Qty</th>
                  <th className="text-right p-4">Produced</th>
                  <th className="text-right p-4">Balance</th>
                  <th className="text-right p-4">Dispatched</th>
                  <th className="text-right p-4">Order Balance</th>
                  <th className="text-left p-4">Delivery</th>
                  <th className="text-left p-4">Status</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.po} className="border-t hover:bg-slate-50">
                    <td className="p-4 font-semibold">{order.po}</td>
                    <td className="p-4">{order.customer}</td>
                    <td className="p-4">{order.part}</td>
                    <td className="p-4 text-right">
                      {order.qty.toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      {order.produced.toLocaleString()}
                    </td>
                    <td className="p-4 text-right font-semibold">
                      {(order.qty - order.produced).toLocaleString()}
                    </td>
                    <td className="p-4 text-right text-blue-700">
                      {(order.dispatchQuantity ?? 0).toLocaleString()}
                    </td>
                    <td className="p-4 text-right font-semibold text-orange-600">
                      {Math.max(
                        0,
                        order.qty - (order.dispatchQuantity ?? 0),
                      ).toLocaleString()}
                    </td>
                    <td className="p-4">{order.delivery}</td>
                    <td className="p-4">
                      <Status status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Kpi({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: string | number;
  tone?: "default" | "green" | "orange" | "blue";
}) {
  const valueClass =
    tone === "green"
      ? "text-green-600"
      : tone === "orange"
        ? "text-orange-600"
        : tone === "blue"
          ? "text-blue-600"
          : "text-slate-900";

  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const styles: Record<string, string> = {
    RUNNING: "bg-green-100 text-green-700",
    IDLE: "bg-yellow-100 text-yellow-700",
    STOPPED: "bg-red-100 text-red-700",
    PAUSED: "bg-orange-100 text-orange-700",
    MAINTENANCE: "bg-purple-100 text-purple-700",
    "In Progress": "bg-blue-100 text-blue-700",
    "In Production": "bg-green-100 text-green-700",
    Pending: "bg-yellow-100 text-yellow-700",
    Completed: "bg-green-100 text-green-700",
  };

  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
        styles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}