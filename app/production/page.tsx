"use client";

import MainNavigation from "../components/main-navigation";
import {
  useDispatchRecords,
  useProductionMachines,
  useProductionOrders,
  type MachineStatus,
} from "../lib/production-store";

const statusStyles: Record<MachineStatus, string> = {
  RUNNING: "bg-green-100 text-green-700",
  IDLE: "bg-yellow-100 text-yellow-700",
  STOPPED: "bg-red-100 text-red-700",
  PAUSED: "bg-orange-100 text-orange-700",
  MAINTENANCE: "bg-purple-100 text-purple-700",
};

function StatusBadge({ status }: { status: MachineStatus }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}

export default function ProductionPage() {
  const machines = useProductionMachines();
  const orders = useProductionOrders().filter(
    (order) => order.status !== "Cancelled",
  );
  const dispatchRecords = useDispatchRecords();
  const dispatchedToday = dispatchRecords
    .filter(
      (dispatch) =>
        dispatch.date === new Date().toISOString().slice(0, 10),
    )
    .reduce((total, dispatch) => total + dispatch.dispatchedQuantity, 0);
  const totalTarget = orders.reduce((sum, order) => sum + order.target, 0);
  const totalProduced = orders.reduce((sum, order) => sum + order.produced, 0);
  const runningMachines = machines.filter(
    (m) => m.status === "RUNNING"
  ).length;

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
        <div className="mb-6">
          <p className="text-sm font-medium text-blue-600">
            Tirupati Brass Industries
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Production</h1>
          <p className="mt-2 text-sm text-slate-500 sm:text-base">
            Live CNC production monitoring and machine performance
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-5 md:grid-cols-5">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total Target</p>
            <p className="mt-2 text-3xl font-bold">
              {totalTarget.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-400">Pieces</p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Produced Today</p>
            <p className="mt-2 text-3xl font-bold text-green-600">
              {totalProduced.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-400">Pieces</p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Balance</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">
              {(totalTarget - totalProduced).toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-400">Pieces remaining</p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">CNC Running</p>
            <p className="mt-2 text-3xl font-bold">
              {runningMachines} / {machines.length}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Machines online
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Dispatched Today</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">
              {dispatchedToday.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-400">Pieces shipped</p>
          </div>
        </div>

        {/* Machine Section */}
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">
                CNC Machines
              </h2>
              <p className="text-sm text-slate-500">
                Current production status
              </p>
            </div>

            <span className="text-sm text-slate-400">
              Updated just now
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {machines.map((machine) => {
              const progress = machine.target
                ? Math.min(
                    100,
                    Math.round((machine.produced / machine.target) * 100),
                  )
                : 0;

              return (
              <div
                key={machine.name}
                className="rounded-2xl border bg-white p-5 shadow-sm"
              >
                {/* Machine Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold">
                      {machine.name}
                    </h3>

                    <p className="text-sm text-slate-500">
                      {machine.part}
                    </p>
                  </div>

                  <StatusBadge status={machine.status} />
                </div>

                {/* Order */}
                <div className="mt-5 rounded-xl bg-slate-50 p-4">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">
                      Order
                    </span>

                    <span className="text-sm font-semibold">
                      {machine.order}
                    </span>
                  </div>

                  <div className="mt-3 flex justify-between">
                    <span className="text-sm text-slate-500">
                      Target
                    </span>

                    <span className="text-sm font-semibold">
                      {machine.target.toLocaleString()} pcs
                    </span>
                  </div>

                  <div className="mt-3 flex justify-between">
                    <span className="text-sm text-slate-500">
                      Produced
                    </span>

                    <span className="text-sm font-semibold text-green-600">
                      {machine.produced.toLocaleString()} pcs
                    </span>
                  </div>
                </div>

                {/* Progress */}
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-slate-500">
                      Production
                    </span>

                    <span className="font-semibold">
                      {progress}%
                    </span>
                  </div>

                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{
                        width: `${progress}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Machine Details */}
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-slate-400">
                      Downtime
                    </p>

                    <p className="mt-1 font-semibold">
                      {machine.downtime} min
                    </p>
                  </div>
                </div>

                {/* Balance */}
                <div className="mt-4 flex justify-between border-t pt-4">
                  <span className="text-sm text-slate-500">
                    Balance
                  </span>

                  <span className="font-bold">
                    {(machine.target - machine.produced).toLocaleString()} pcs
                  </span>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">
                Production System
              </p>

              <p className="text-sm text-slate-500">
                CNC production monitoring
              </p>
            </div>

            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              SYSTEM ONLINE
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}