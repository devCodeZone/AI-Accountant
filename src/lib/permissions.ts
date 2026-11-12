import type { Role } from "./types";
import { HttpError } from "./errors";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff / Site Supervisor",
  accountant: "Accountant / CA (read-only)",
};

export const can = {
  addEntries: (r: Role) => r !== "accountant",
  editEntries: (r: Role) => r === "owner" || r === "admin",
  deleteEntries: (r: Role) => r === "owner" || r === "admin",
  viewFinancials: (r: Role) => r !== "staff", // full P&L, dashboard, reports
  export: (r: Role) => r !== "staff",
  manageSettings: (r: Role) => r === "owner" || r === "admin",
  manageUsers: (r: Role) => r === "owner" || r === "admin",
  manageSso: (r: Role) => r === "owner",
  documents: (r: Role) => r === "owner" || r === "admin",
};

export function assert(ok: boolean, msg = "You don't have permission to do this") {
  if (!ok) throw new HttpError(403, msg);
}
