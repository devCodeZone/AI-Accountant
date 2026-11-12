import type { InvoiceItem } from "./types";

export const STATES: [string, string][] = [
  ["01", "Jammu & Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh"], ["05", "Uttarakhand"],
  ["06", "Haryana"], ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"], ["10", "Bihar"], ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"], ["13", "Nagaland"], ["14", "Manipur"], ["15", "Mizoram"], ["16", "Tripura"], ["17", "Meghalaya"],
  ["18", "Assam"], ["19", "West Bengal"], ["20", "Jharkhand"], ["21", "Odisha"], ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"],
  ["24", "Gujarat"], ["26", "Dadra & Nagar Haveli and Daman & Diu"], ["27", "Maharashtra"], ["29", "Karnataka"], ["30", "Goa"],
  ["31", "Lakshadweep"], ["32", "Kerala"], ["33", "Tamil Nadu"], ["34", "Puducherry"], ["35", "Andaman & Nicobar"],
  ["36", "Telangana"], ["37", "Andhra Pradesh"], ["38", "Ladakh"],
];
export const stateName = (code?: string | null) => STATES.find(([c]) => c === code)?.[1] ?? "";

export const GST_RATES = [0, 5, 12, 18, 28];
export const isValidGstin = (g: string) => /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g.toUpperCase());

/** Common SAC/HSN codes for interior work */
export const HSN_HINTS = [
  { code: "995432", label: "Installation / finishing works (interior works contract)" },
  { code: "998391", label: "Interior design services" },
  { code: "9954", label: "Construction services (works contract)" },
  { code: "9403", label: "Furniture (goods)" },
  { code: "4412", label: "Plywood (goods)" },
];

export function computeInvoice(items: InvoiceItem[], companyState: string | null, placeOfSupply: string | null, gstOn: boolean) {
  let subtotal = 0, tax = 0;
  for (const it of items) {
    const line = Number(it.qty || 0) * Number(it.rate || 0);
    subtotal += line;
    if (gstOn) tax += (line * Number(it.gst_rate || 0)) / 100;
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  const inter = gstOn && !!companyState && !!placeOfSupply && companyState !== placeOfSupply;
  return {
    subtotal: r(subtotal),
    cgst: gstOn && !inter ? r(tax / 2) : 0,
    sgst: gstOn && !inter ? r(tax / 2) : 0,
    igst: inter ? r(tax) : 0,
    total: r(subtotal + tax),
    inter,
  };
}
