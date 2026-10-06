export const machineTypes = [
  "CNC",
  "Manual",
  "Drilling",
  "Milling",
  "Power Press",
  "Special Machine",
  "Other",
] as const;

export type MachineType = (typeof machineTypes)[number];
export type MachineMasterStatus = "Active" | "Inactive";

export type MachineMasterRecord = {
  id: string;
  machineName: string;
  machineCode: string;
  machineType: MachineType;
  status: MachineMasterStatus;
  location: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};
