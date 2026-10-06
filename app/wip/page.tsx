"use client";

import Link from "next/link";
import MainNavigation from "../components/main-navigation";
import {
  useProductionOrders,
  useProductionWipStages,
  type MachineStatus,
} from "../lib/production-store";

const statusStyles: Record<MachineStatus, string> = {
  RUNNING: "bg-green-100 text-green-700",
  IDLE: "bg-yellow-100 text-yellow-700",
  STOPPED: "bg-red-100 text-red-700",
  PAUSED: "bg-orange-100 text-orange-700",
  MAINTENANCE: "bg-purple-100 text-purple-700",
};

export default function WIPPage() {
  const orders = useProductionOrders();
  const stages = useProductionWipStages();
  const wipData = orders
    .filter((order) => order.status !== "Cancelled")
    .map((order) => {
      const orderStages = stages.filter((stage) => stage.po === order.po);
      const productionBalance = Math.max(0, order.target - order.produced);
      const awaitingInspection = orderStages.find(
        (stage) => stage.stage === "AWAITING_INSPECTION",
      )?.quantity ?? 0;
      const quantityReady = orderStages.find(
        (stage) => stage.stage === "QC_PASSED_AWAITING_DISPATCH",
      )?.quantity ?? 0;
      const quantityRejected = orderStages.find(
        (stage) => stage.stage === "QC_REJECTED",
      )?.quantity ?? 0;
      const machineStatus: MachineStatus =
        order.status === "In Production"
          ? "RUNNING"
          : order.status === "On Hold"
            ? "PAUSED"
            : "IDLE";

      return {
        ...order,
        qty: productionBalance + awaitingInspection + quantityReady + quantityRejected,
        process: [
          awaitingInspection > 0
            ? `${awaitingInspection.toLocaleString()} pcs awaiting inspection`
            : "",
          quantityReady > 0
            ? `${quantityReady.toLocaleString()} pcs QC-passed, awaiting dispatch`
            : "",
          quantityRejected > 0
            ? `${quantityRejected.toLocaleString()} pcs QC-rejected, blocked`
            : "",
        ]
          .filter(Boolean)
          .join("; ") || order.status,
        machineStatus,
      };
    })
    .filter((order) => order.qty > 0);
  const totalWIP = wipData.reduce((total, item) => total + item.qty, 0);
  const inProduction = wipData
    .filter((item) => item.status === "In Production")
    .reduce((total, item) => total + item.qty, 0);
  const waiting = totalWIP - inProduction;

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
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Tirupati Brass Industries
            </Link>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">WIP</h1>
            <p className="mt-2 text-sm text-slate-500 sm:text-base">
              Work in Progress — track material and parts moving through production
            </p>
          </div>
          <Link
            href="/production"
            className="inline-flex w-fit items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            ← Production
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-5 md:grid-cols-3">

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Total WIP
            </p>
            <p className="mt-2 text-4xl font-bold text-slate-900">
              {totalWIP.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Pieces
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              In Production
            </p>
            <p className="mt-2 text-4xl font-bold text-green-600">
              {inProduction.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Pieces machining
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Waiting
            </p>
            <p className="mt-2 text-4xl font-bold text-red-600">
              {waiting.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Pieces waiting
            </p>
          </div>

        </div>

        {/* WIP Table */}
        <div className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">

          <div className="border-b px-6 py-5">
            <h2 className="text-xl font-bold text-slate-900">
              Work in Progress
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Current material and production status
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="mobile-card-table mobile-card-table--wip w-full text-left">

              <thead className="bg-slate-50 text-sm text-slate-500">
                <tr>
                  <th className="px-6 py-4">Part</th>
                  <th className="px-6 py-4">Order</th>
                  <th className="px-6 py-4">Material</th>
                  <th className="px-6 py-4">Machine</th>
                  <th className="px-6 py-4">Process</th>
                  <th className="px-6 py-4">WIP Qty</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y">

                {wipData.map((item) => (
                  <tr
                    key={item.po}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-6 py-5 font-semibold text-slate-900">
                      {item.part}
                    </td>

                    <td className="px-6 py-5 text-slate-600">
                      {item.po}
                    </td>

                    <td className="px-6 py-5 text-slate-600">
                      {item.material}
                    </td>

                    <td className="px-6 py-5 font-medium text-slate-700">
                      {item.machine}
                    </td>

                    <td className="px-6 py-5 text-slate-600">
                      {item.process}
                    </td>

                    <td className="px-6 py-5 font-bold text-slate-900">
                      {item.qty.toLocaleString()} pcs
                    </td>

                    <td className="px-6 py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          statusStyles[item.machineStatus]
                        }`}
                      >
                        {item.process.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}

              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 rounded-xl border bg-white p-4 text-sm text-slate-500">
          <strong className="text-slate-700">
            WIP Monitoring
          </strong>{" "}
          — Tirupati Brass Industries Production Control System
        </div>

      </div>
    </main>
  );
}