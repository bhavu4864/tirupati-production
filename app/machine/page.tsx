"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import MainNavigation from "../components/main-navigation";
import { useAuth } from "../components/auth-provider";

type Machine = {
  id: string;
  machineName: string;
  status: "Active" | "Inactive";
  hasProductionHistory: boolean;
};
type MachineRecord = {
  id: string;
  machineId: string;
  machineName: string;
  date: string;
  partNo: string;
  morningPcs: number | null;
  eveningPcs: number | null;
  morningStartTime: string;
  morningEndTime: string;
  eveningStartTime: string;
  eveningEndTime: string;
  totalPcs: number;
  operatorName: string;
  breakdown: "Yes" | "No";
  breakdownReason: string;
};
type MachineData = {
  machineId: string;
  date: string;
  partNo: string;
  morningPcs: number | null;
  eveningPcs: number | null;
  morningStartTime: string;
  morningEndTime: string;
  eveningStartTime: string;
  eveningEndTime: string;
  operatorName: string;
  breakdown: "Yes" | "No";
  breakdownReason: string;
};

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const emptyData = (machineId = "", date = localDate()): MachineData => ({
  machineId,
  date,
  partNo: "",
  morningPcs: null,
  eveningPcs: null,
  morningStartTime: "08:30",
  morningEndTime: "12:30",
  eveningStartTime: "13:00",
  eveningEndTime: "19:00",
  operatorName: "",
  breakdown: "No",
  breakdownReason: "",
});

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "The request could not be completed.";
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN");
}

export default function MachinePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canRecord = isAdmin || user?.role === "PRODUCTION";
  const [machines, setMachines] = useState<Machine[]>([]);
  const [records, setRecords] = useState<MachineRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [draft, setDraft] = useState<MachineData | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [newMachineName, setNewMachineName] = useState("");
  const [machineNameDrafts, setMachineNameDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadMachineData = useCallback(async () => {
    try {
      const query = showAllHistory ? "" : `?date=${encodeURIComponent(selectedDate)}`;
      const response = await fetch(`/api/machine-data${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const result = await response.json() as { machines: Machine[]; records: MachineRecord[] };
      setMachines(result.machines);
      setRecords(result.records);
      setMachineNameDrafts(Object.fromEntries(result.machines.map((machine) => [
        machine.id,
        machine.machineName,
      ])));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load machine data.");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, showAllHistory]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMachineData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMachineData]);

  async function addMachine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/machine-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineName: newMachineName }),
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      setNewMachineName("");
      setMessage("Machine added.");
      await loadMachineData();
    } catch {
      setError("Unable to add the machine.");
    } finally {
      setSaving(false);
    }
  }

  async function updateMachine(
    machine: Machine,
    status: Machine["status"],
    machineName = machine.machineName,
  ) {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/machine-master/${encodeURIComponent(machine.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineName, status }),
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      setMessage(machine.machineName === machineName
        ? `${machine.machineName} ${status.toLowerCase()}.`
        : `${machineName} saved.`);
      await loadMachineData();
    } catch {
      setError("Unable to update the machine.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMachine(machine: Machine) {
    if (machine.hasProductionHistory) {
      setError(`${machine.machineName} has production history and cannot be permanently deleted. Deactivate / archive it instead.`);
      return;
    }
    if (!window.confirm("Are you sure you want to permanently delete this machine?")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/machine-master/${encodeURIComponent(machine.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      setMessage(`${machine.machineName} permanently deleted.`);
      await loadMachineData();
    } catch {
      setError("Unable to delete the machine.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDailyData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    if (draft.morningPcs === null && draft.eveningPcs === null) {
      setError("Enter production PCS for at least one period before saving.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/machine-data", {
        method: editingRecordId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, id: editingRecordId }),
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      setMessage(editingRecordId ? "Production record updated." : "Production record saved.");
      setSelectedDate(draft.date);
      setShowAllHistory(false);
      setIsEntryOpen(false);
      setDraft(null);
      setEditingRecordId(null);
      await loadMachineData();
    } catch {
      setError("Unable to save the daily production record.");
    } finally {
      setSaving(false);
    }
  }

  function startNewProduction() {
    setDraft(emptyData(
      machines.find((machine) => machine.status === "Active")?.id ?? "",
      selectedDate,
    ));
    setEditingRecordId(null);
    setIsEntryOpen(true);
    setError("");
    setMessage("");
  }

  function editProduction(record: MachineRecord) {
    setDraft({
      machineId: record.machineId,
      date: record.date,
      partNo: record.partNo,
      morningPcs: record.morningPcs,
      eveningPcs: record.eveningPcs,
      morningStartTime: record.morningStartTime,
      morningEndTime: record.morningEndTime,
      eveningStartTime: record.eveningStartTime,
      eveningEndTime: record.eveningEndTime,
      operatorName: record.operatorName,
      breakdown: record.breakdown,
      breakdownReason: record.breakdownReason,
    });
    setEditingRecordId(record.id);
    setIsEntryOpen(true);
    setError("");
    setMessage("");
  }

  function cancelProductionEdit() {
    setDraft(null);
    setEditingRecordId(null);
    setIsEntryOpen(false);
    setError("");
  }

  const inputClass = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base";
  const dailyTotal = records.reduce((total, record) => total + record.totalPcs, 0);
  const machineTotals = records.reduce<Record<string, number>>((totals, record) => {
    totals[record.machineId] = (totals[record.machineId] ?? 0) + record.totalPcs;
    return totals;
  }, {});
  const exportHref = showAllHistory
    ? "/api/machine-data/export"
    : `/api/machine-data/export?date=${encodeURIComponent(selectedDate)}`;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-950 px-4 py-4 text-white sm:px-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-lg font-bold tracking-tight sm:text-2xl">TIRUPATI BRASS INDUSTRIES</p>
          <p className="text-xs text-slate-400 sm:text-sm">Machine Data</p>
        </div>
      </header>
      <MainNavigation />
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h1 className="text-2xl font-bold">Machine Data</h1>
          <div className="flex flex-col gap-2 sm:flex-row">
            {canRecord && (
              <button
                type="button"
                onClick={() => isEntryOpen ? cancelProductionEdit() : startNewProduction()}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {isEntryOpen ? "Cancel Production" : "Add Production"}
              </button>
            )}
            <a
              href={exportHref}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-600 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              Export to Excel
            </a>
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p>}

        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="text-sm font-medium">
            Production date
            <input
              type="date"
              required
              value={selectedDate}
              disabled={showAllHistory}
              onChange={(event) => setSelectedDate(event.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowAllHistory((current) => !current)}
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${
              showAllHistory
                ? "bg-slate-800 text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {showAllHistory ? "Showing all history" : "View all history"}
          </button>
          {!showAllHistory && (
            <div className="sm:col-span-2">
              <p className="text-sm text-slate-500">Daily total PCS</p>
              <p className="text-2xl font-bold text-blue-700">{dailyTotal.toLocaleString()} PCS</p>
            </div>
          )}
        </section>

        {isAdmin && (
          <details className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer list-none text-lg font-semibold [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-3">
                Machine Master
                <span className="text-sm font-medium text-blue-700 group-open:hidden">Expand</span>
                <span className="hidden text-sm font-medium text-blue-700 group-open:inline">Collapse</span>
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              <form onSubmit={addMachine} className="flex flex-col gap-2 sm:flex-row">
                <input required maxLength={120} value={newMachineName} onChange={(event) => setNewMachineName(event.target.value)} placeholder="Machine name" aria-label="Machine name" className={`${inputClass} mt-0`} />
                <button type="submit" disabled={saving} className="min-h-11 shrink-0 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-60">Add Machine</button>
              </form>
              {machines.map((machine) => (
                    <div key={machine.id} className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
                      <input
                        required
                        maxLength={120}
                        aria-label={`Machine name ${machine.machineName}`}
                        value={machineNameDrafts[machine.id] ?? machine.machineName}
                        onChange={(event) => setMachineNameDrafts((current) => ({
                          ...current,
                          [machine.id]: event.target.value,
                        }))}
                        className={`${inputClass} mt-0 sm:flex-1`}
                      />
                      <span className="text-sm text-slate-500">{machine.status}</span>
                      <button
                        type="button"
                        disabled={saving || !machineNameDrafts[machine.id]?.trim()}
                        onClick={() => void updateMachine(
                          machine,
                          machine.status,
                          machineNameDrafts[machine.id] ?? machine.machineName,
                        )}
                        className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-60"
                      >
                        Save Name
                      </button>
                      {machine.hasProductionHistory ? (
                        <>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void updateMachine(machine, machine.status === "Active" ? "Inactive" : "Active")}
                            className="min-h-11 rounded-lg border border-amber-300 px-3 text-sm font-semibold text-amber-900 disabled:opacity-60"
                            aria-label={`${machine.status === "Active" ? "Deactivate" : "Activate"} ${machine.machineName}`}
                          >
                            {machine.status === "Active" ? "Deactivate" : "Activate"}
                          </button>
                          <span className="text-xs text-slate-600 sm:basis-full">
                            Permanent delete is unavailable because this machine has production history. Deactivate it to preserve its records.
                          </span>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void deleteMachine(machine)}
                          className="min-h-11 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:opacity-60"
                          aria-label={`Delete ${machine.machineName}`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
            </div>
          </details>
        )}

        {canRecord && isEntryOpen && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">
              {editingRecordId ? "Edit Production Record" : "Add Production"}
            </h2>
            <form onSubmit={saveDailyData} className="machine-entry-form mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-medium">Production Date<input required type="date" value={draft?.date ?? selectedDate} onChange={(event) => setDraft({ ...(draft ?? emptyData()), date: event.target.value })} className={inputClass} /></label>
              <label className="text-sm font-medium">Machine<select required value={draft?.machineId ?? ""} onChange={(event) => setDraft({ ...(draft ?? emptyData()), machineId: event.target.value })} className={inputClass}><option value="">Select machine</option>{machines.filter((machine) => machine.status === "Active" || machine.id === draft?.machineId).map((machine) => <option key={machine.id} value={machine.id}>{machine.machineName}{machine.status === "Inactive" ? " (Inactive)" : ""}</option>)}</select></label>
              <label className="text-sm font-medium">Part No.<input required maxLength={120} value={draft?.partNo ?? ""} onChange={(event) => setDraft({ ...(draft ?? emptyData()), partNo: event.target.value })} className={inputClass} /></label>
              <label className="text-sm font-medium">Operator Name<input required maxLength={120} value={draft?.operatorName ?? ""} onChange={(event) => setDraft({ ...(draft ?? emptyData()), operatorName: event.target.value })} className={inputClass} /></label>
              <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2 lg:col-span-3 sm:grid-cols-2">
                <legend className="px-1 text-sm font-semibold">Morning production period</legend>
                <label className="text-sm font-medium">Start time<input required type="time" value={draft?.morningStartTime ?? "08:30"} onChange={(event) => setDraft({ ...(draft ?? emptyData()), morningStartTime: event.target.value })} className={inputClass} /></label>
                <label className="text-sm font-medium">End time<input required type="time" value={draft?.morningEndTime ?? "12:30"} onChange={(event) => setDraft({ ...(draft ?? emptyData()), morningEndTime: event.target.value })} className={inputClass} /></label>
                <label className="text-sm font-medium sm:col-span-2">Morning PCS<input type="number" min="0" step="1" inputMode="numeric" value={draft?.morningPcs ?? ""} placeholder="Not entered" onChange={(event) => setDraft({ ...(draft ?? emptyData()), morningPcs: event.target.value === "" ? null : Number(event.target.value) })} className={inputClass} /></label>
              </fieldset>
              <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2 lg:col-span-3 sm:grid-cols-2">
                <legend className="px-1 text-sm font-semibold">Afternoon production period</legend>
                <label className="text-sm font-medium">Start time<input required type="time" value={draft?.eveningStartTime ?? "13:00"} onChange={(event) => setDraft({ ...(draft ?? emptyData()), eveningStartTime: event.target.value })} className={inputClass} /></label>
                <label className="text-sm font-medium">End time<input required type="time" value={draft?.eveningEndTime ?? "19:00"} onChange={(event) => setDraft({ ...(draft ?? emptyData()), eveningEndTime: event.target.value })} className={inputClass} /></label>
                <label className="text-sm font-medium sm:col-span-2">Afternoon PCS<input type="number" min="0" step="1" inputMode="numeric" value={draft?.eveningPcs ?? ""} placeholder="Not entered" onChange={(event) => setDraft({ ...(draft ?? emptyData()), eveningPcs: event.target.value === "" ? null : Number(event.target.value) })} className={inputClass} /></label>
              </fieldset>
              <div className="machine-total rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2 lg:col-span-3">
                <span className="text-slate-500">Total PCS</span>
                <strong className="ml-2 text-lg">{((draft?.morningPcs ?? 0) + (draft?.eveningPcs ?? 0)).toLocaleString()}</strong>
              </div>
              <label className="text-sm font-medium">Breakdown<select value={draft?.breakdown ?? "No"} onChange={(event) => setDraft({ ...(draft ?? emptyData()), breakdown: event.target.value as MachineData["breakdown"], breakdownReason: event.target.value === "No" ? "" : (draft?.breakdownReason ?? "") })} className={inputClass}><option>Yes</option><option>No</option></select></label>
              {draft?.breakdown === "Yes" && <label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Breakdown Reason / What Happened<textarea required maxLength={1000} rows={2} value={draft.breakdownReason} onChange={(event) => setDraft({ ...draft, breakdownReason: event.target.value })} className={inputClass} /></label>}
              <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
                <button type="submit" disabled={saving || !draft?.machineId || (draft.morningPcs === null && draft.eveningPcs === null)} className="machine-save min-h-11 flex-1 rounded-lg bg-blue-600 px-4 font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
                <button type="button" onClick={cancelProductionEdit} disabled={saving} className="min-h-11 rounded-lg border border-slate-300 px-4 font-medium disabled:opacity-60">Cancel</button>
              </div>
            </form>
          </section>
        )}

        {loading ? <p className="text-sm text-slate-500">Loading machine history…</p> :
          machines.length === 0 ? <p className="rounded-lg bg-white p-4 text-sm text-slate-500">No machines have been added yet.</p> :
            machines.map((machine) => {
              const history = records.filter((record) => record.machineId === machine.id);
              return (
                <section key={machine.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                    <div>
                      <h2 className="text-lg font-semibold">{machine.machineName}</h2>
                      {!showAllHistory && (
                        <p className="text-sm font-medium text-blue-700">
                          { (machineTotals[machine.id] ?? 0).toLocaleString() } PCS for {formatDate(selectedDate)}
                        </p>
                      )}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${machine.status === "Active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>{machine.status}</span>
                  </div>
                  {history.length === 0 ? <p className="p-4 text-sm text-slate-500">No production records yet.</p> :
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                          <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Part No.</th>
                            <th className="px-4 py-3">Morning PCS</th>
                            <th className="px-4 py-3">Afternoon PCS</th>
                            <th className="px-4 py-3">Total PCS</th>
                            <th className="px-4 py-3">Operator Name</th>
                            <th className="px-4 py-3">Breakdown</th>
                            <th className="px-4 py-3">Breakdown Reason</th>
                            {canRecord && <th className="px-4 py-3">Action</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {history.map((record) => (
                            <tr key={record.id} className="whitespace-nowrap">
                              <td className="px-4 py-3">{formatDate(record.date)}</td>
                              <td className="px-4 py-3">{record.partNo}</td>
                              <td className="px-4 py-3">
                                <span className="block text-xs text-slate-500">{record.morningStartTime}–{record.morningEndTime}</span>
                                {record.morningPcs === null ? "Not entered" : record.morningPcs.toLocaleString()}
                              </td>
                              <td className="px-4 py-3">
                                <span className="block text-xs text-slate-500">{record.eveningStartTime}–{record.eveningEndTime}</span>
                                {record.eveningPcs === null ? "Not entered" : record.eveningPcs.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 font-semibold">{record.totalPcs.toLocaleString()}</td>
                              <td className="px-4 py-3">{record.operatorName}</td>
                              <td className="px-4 py-3">{record.breakdown}</td>
                              <td className="max-w-xs whitespace-normal px-4 py-3">
                                {record.breakdown === "Yes" ? record.breakdownReason : ""}
                              </td>
                              {canRecord && <td className="px-4 py-3"><button type="button" onClick={() => editProduction(record)} className="min-h-10 rounded-lg border border-blue-200 px-3 font-semibold text-blue-700 hover:bg-blue-50">Edit</button></td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>}
                  {history.length > 0 && (
                    <div className="divide-y divide-slate-100 md:hidden">
                      {history.map((record) => (
                        <article key={record.id} className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-semibold">{record.partNo}</h3>
                              <p className="text-sm text-slate-500">{formatDate(record.date)}</p>
                            </div>
                            <p className="text-right">
                              <span className="block text-xs text-slate-500">Total PCS</span>
                              <strong className="text-lg text-blue-800">{record.totalPcs.toLocaleString()}</strong>
                            </p>
                          </div>
                          <dl className="grid grid-cols-2 gap-3 text-sm">
                            <div><dt className="text-xs text-slate-500">Morning · {record.morningStartTime}–{record.morningEndTime}</dt><dd className="font-medium">{record.morningPcs === null ? "Not entered" : `${record.morningPcs.toLocaleString()} PCS`}</dd></div>
                            <div><dt className="text-xs text-slate-500">Afternoon · {record.eveningStartTime}–{record.eveningEndTime}</dt><dd className="font-medium">{record.eveningPcs === null ? "Not entered" : `${record.eveningPcs.toLocaleString()} PCS`}</dd></div>
                            <div><dt className="text-xs text-slate-500">Operator</dt><dd className="break-words font-medium">{record.operatorName}</dd></div>
                            <div><dt className="text-xs text-slate-500">Breakdown</dt><dd className="font-medium">{record.breakdown}</dd></div>
                          </dl>
                          {canRecord && <button type="button" onClick={() => editProduction(record)} className="min-h-11 w-full rounded-lg border border-blue-200 font-semibold text-blue-700 hover:bg-blue-50">Edit</button>}
                          {record.breakdown === "Yes" && (
                            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                              <span className="block text-xs font-semibold text-amber-700">Breakdown reason</span>
                              {record.breakdownReason}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
      </div>
    </main>
  );
}
