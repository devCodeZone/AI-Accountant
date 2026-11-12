export type Role = "owner" | "admin" | "staff" | "accountant";
export type Direction = "in" | "out";
export type Mode = "cash" | "bank" | "upi" | "cheque" | "card";
export type EntryType = "money" | "vendor_bill" | "labour_work";
export type TxnStatus = "draft" | "needs_review" | "confirmed";
export type Source = "typed" | "voice" | "photo" | "bank_import" | "excel_import" | "manual";
export type PartyType = "client" | "vendor" | "labour" | "other";

export interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  logo_url: string | null;
  brand_color: string;
  address: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  invoice_prefix: string;
  receipt_prefix: string;
  quotation_prefix: string;
  fy_start_month: number;
  currency: string;
  lock_before: string | null;
  sso_external_id: string | null;
  sso_secret: string | null;
  sso_return_url: string | null;
  app_label: string | null;
  is_demo: boolean;
}

export interface AppUser {
  id: string;
  company_id: string;
  phone: string;
  name: string | null;
  role: Role;
  active: boolean;
  last_login_at: string | null;
}

export interface Account {
  id: string;
  company_id: string;
  name: string;
  type: "cash" | "bank" | "upi" | "card";
  opening_balance: number;
  bank_name: string | null;
  account_last4: string | null;
  is_default: boolean;
  active: boolean;
}

export interface Category {
  id: string;
  company_id: string;
  name: string;
  group_name: string;
  kind: "income" | "expense" | "other";
  counts_in_pl: boolean;
  is_transfer: boolean;
  sort: number;
  active: boolean;
}

export interface Party {
  id: string;
  company_id: string;
  name: string;
  type: PartyType;
  trade: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  state: string | null;
  opening_balance: number;
  notes: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  company_id: string;
  name: string;
  client_id: string | null;
  site_address: string | null;
  quoted_value: number;
  budget: Record<string, number>;
  start_date: string | null;
  end_date: string | null;
  status: "lead" | "active" | "on_hold" | "completed" | "cancelled";
  share_token: string;
  notes: string | null;
  created_at: string;
}

export interface Stage {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  is_extra: boolean;
  amount: number;
  due_date: string | null;
  status: "pending" | "invoiced" | "paid";
  sort: number;
}

export interface InvoiceItem {
  description: string;
  hsn_sac?: string;
  qty: number;
  unit?: string;
  rate: number;
  gst_rate: number;
}

export interface Invoice {
  id: string;
  company_id: string;
  doc_type: "invoice" | "quotation" | "receipt";
  number: string;
  doc_date: string;
  due_date: string | null;
  party_id: string | null;
  project_id: string | null;
  stage_id: string | null;
  transaction_id: string | null;
  place_of_supply: string | null;
  items: InvoiceItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  notes: string | null;
  terms: string | null;
  status: "draft" | "sent" | "paid" | "cancelled";
  share_token: string;
  created_at: string;
}

export interface Txn {
  id: string;
  company_id: string;
  txn_date: string;
  amount: number;
  direction: Direction;
  entry_type: EntryType;
  mode: Mode | null;
  account_id: string | null;
  party_id: string | null;
  project_id: string | null;
  stage_id: string | null;
  category_id: string | null;
  sub_category: string | null;
  gst_rate: number | null;
  gst_amount: number;
  tds_amount: number;
  bill_no: string | null;
  reference: string | null;
  due_date: string | null;
  settles_bill: boolean;
  notes: string | null;
  attachments: string[];
  source: Source;
  status: TxnStatus;
  is_approximate: boolean;
  ai_confidence: number | null;
  reconciled: boolean;
  transfer_group: string | null;
  invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  uid: string | null; // app_users.id (null while onboarding)
  phone: string;
  name: string | null;
  company_id: string | null;
  role: Role | null;
  via: "otp" | "sso" | "demo";
}

/** A draft the AI (or an importer) proposes. Never saved until the user confirms. */
export interface DraftEntry {
  key: string;
  txn_date: string;
  amount: number;
  direction: Direction;
  entry_type: EntryType;
  mode: Mode | null;
  account_id: string | null;
  party_id: string | null;
  party_name: string | null;
  party_type: PartyType | null;
  party_trade: string | null;
  project_id: string | null;
  project_name: string | null;
  category_id: string | null;
  sub_category: string | null;
  gst_rate: number | null;
  gst_amount: number;
  tds_amount: number;
  bill_no: string | null;
  reference: string | null;
  due_date: string | null;
  settles_bill: boolean;
  notes: string | null;
  attachments: string[];
  source: Source;
  is_approximate: boolean;
  is_transfer: boolean;
  to_account_id?: string | null;
  confidence: number;
  question: string | null;
  line_items?: { description: string; qty?: number; rate?: number; amount?: number }[];
  match_txn_id?: string | null; // bank import: matched existing entry
  duplicate_of?: string | null;
}
