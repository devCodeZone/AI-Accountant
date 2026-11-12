export const PROJECT_FIELDS = ["name", "client_id", "site_address", "quoted_value", "start_date", "end_date", "status", "notes", "budget"];
export function pickProject(body: any) {
  const o: Record<string, any> = {};
  for (const k of PROJECT_FIELDS) if (k in body) o[k] = body[k] === "" ? null : body[k];
  if ("quoted_value" in o) o.quoted_value = Number(o.quoted_value) || 0;
  return o;
}

export function pickParty(b: any) {
  const o: Record<string, any> = {};
  for (const k of ["name", "type", "trade", "phone", "email", "gstin", "pan", "address", "state", "opening_balance", "notes"]) if (k in b) o[k] = b[k] === "" ? null : b[k];
  if ("opening_balance" in o) o.opening_balance = Number(o.opening_balance) || 0;
  if (o.gstin) o.gstin = String(o.gstin).toUpperCase();
  if (o.type && !["client", "vendor", "labour", "other"].includes(o.type)) o.type = "other";
  return o;
}

