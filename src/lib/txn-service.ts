import "server-only";
import { randomUUID } from "crypto";
import { sb } from "./supabase";
import { audit, bestMatch, normTxn } from "./db";
import { HttpError } from "./session";
import { TRADE_CATEGORY } from "./categories";
import type { DraftEntry, EntryType, Mode, PartyType, Role, TxnStatus } from "./types";

const MODES: Mode[] = ["cash", "bank", "upi", "cheque", "card"];
const ENTRY_TYPES: EntryType[] = ["money", "vendor_bill", "labour_work"];

export type SaveInput = Partial<DraftEntry> & { status?: TxnStatus; stage_id?: string | null };

type Ctx = { company_id: string; uid: string; role: Role };

async function refs(companyId: string) {
  const db = sb();
  const [acc, cats, parties, projects] = await Promise.all([
    db.from("accounts").select("id,type,is_default,name").eq("company_id", companyId).eq("active", true),
    db.from("categories").select("id,name,is_transfer").eq("company_id", companyId),
    db.from("parties").select("id,name,type").eq("company_id", companyId).is("deleted_at", null),
    db.from("projects").select("id,name").eq("company_id", companyId).is("deleted_at", null),
  ]);
  return { accounts: acc.data ?? [], categories: cats.data ?? [], parties: parties.data ?? [], projects: projects.data ?? [] };
}

function pickAccount(accounts: any[], mode: Mode | null | undefined) {
  const wantCash = mode === "cash";
  const pool = accounts.filter((a) => (wantCash ? a.type === "cash" : a.type !== "cash"));
  return (pool.find((a) => a.is_default) ?? pool[0] ?? accounts[0])?.id ?? null;
}

/** Validate + resolve references + insert. Returns inserted rows. Used by manual entry, AI confirm, imports. */
export async function saveEntries(ctx: Ctx, inputs: SaveInput[]) {
  if (ctx.role === "accountant") throw new HttpError(403, "Read-only role");
  if (!inputs.length) return [];
  const r = await refs(ctx.company_id);
  const db = sb();
  const transferCat = r.categories.find((c: any) => c.is_transfer)?.id ?? null;
  const rows: any[] = [];

  for (const e of inputs) {
    const amount = Math.round(Number(e.amount) * 100) / 100;
    if (!(amount > 0)) throw new HttpError(400, "Amount must be more than 0");
    if (!e.txn_date || !/^\d{4}-\d{2}-\d{2}$/.test(e.txn_date)) throw new HttpError(400, "Date is required");
    const direction = e.direction === "in" ? "in" : "out";
    const entry_type: EntryType = ENTRY_TYPES.includes(e.entry_type as EntryType) ? (e.entry_type as EntryType) : "money";
    const mode: Mode | null = entry_type === "money" ? (MODES.includes(e.mode as Mode) ? (e.mode as Mode) : "cash") : null;

    // Category must belong to this company
    let category_id = e.category_id && r.categories.some((c: any) => c.id === e.category_id) ? e.category_id : null;

    // Party: id → fuzzy name match → create
    let party_id = e.party_id && r.parties.some((p: any) => p.id === e.party_id) ? e.party_id : null;
    if (!party_id && e.party_name?.trim()) {
      const m = bestMatch(e.party_name, r.parties, (p: any) => p.name, 0.8);
      if (m) party_id = (m as any).id;
      else {
        const type: PartyType = e.party_type ?? (e.party_trade ? "labour" : direction === "in" ? "client" : "vendor");
        const { data, error } = await db.from("parties").insert({
          company_id: ctx.company_id, name: e.party_name.trim(), type, trade: e.party_trade ?? null,
        }).select("id,name,type").single();
        if (error) throw error;
        r.parties.push(data);
        party_id = data.id;
        await audit(ctx.company_id, ctx.uid, "party", data.id, "create", null, data);
      }
    }
    if (!category_id && e.party_trade && TRADE_CATEGORY[e.party_trade]) {
      category_id = r.categories.find((c: any) => c.name === TRADE_CATEGORY[e.party_trade!])?.id ?? null;
    }

    let project_id = e.project_id && r.projects.some((p: any) => p.id === e.project_id) ? e.project_id : null;
    if (!project_id && e.project_name) project_id = (bestMatch(e.project_name, r.projects, (p: any) => p.name, 0.5) as any)?.id ?? null;

    let account_id = entry_type === "money"
      ? (e.account_id && r.accounts.some((a: any) => a.id === e.account_id) ? e.account_id : pickAccount(r.accounts, mode))
      : null;

    const status: TxnStatus = e.status ?? (e.is_approximate ? "needs_review" : "confirmed");
    const base = {
      company_id: ctx.company_id,
      txn_date: e.txn_date,
      amount,
      entry_type,
      mode,
      party_id,
      project_id,
      stage_id: e.stage_id ?? null,
      sub_category: e.sub_category ?? null,
      gst_rate: e.gst_rate ?? null,
      gst_amount: Number(e.gst_amount ?? 0) || 0,
      tds_amount: Number(e.tds_amount ?? 0) || 0,
      bill_no: e.bill_no ?? null,
      reference: e.reference ?? null,
      due_date: e.due_date || null,
      settles_bill: !!e.settles_bill,
      notes: e.notes ?? null,
      attachments: e.attachments ?? [],
      source: e.source ?? "manual",
      status,
      is_approximate: !!e.is_approximate,
      ai_confidence: e.confidence ?? null,
      created_by: ctx.uid,
      updated_by: ctx.uid,
    };

    // Cash <-> bank transfer: two legs, never income/expense
    if (e.is_transfer && entry_type === "money") {
      const to = e.to_account_id && r.accounts.some((a: any) => a.id === e.to_account_id) ? e.to_account_id
        : pickAccount(r.accounts, (r.accounts.find((a: any) => a.id === account_id)?.type ?? (mode === "cash" ? "cash" : "bank")) === "cash" ? "bank" : "cash");
      if (!account_id || !to || to === account_id) throw new HttpError(400, "Pick two different accounts for a transfer");
      const g = randomUUID();
      // A bank line with direction "in" (cash deposited) means money moved INTO account_id.
      const [fromAcc, toAcc] = direction === "in" && !e.to_account_id ? [to, account_id] : [account_id, to];
      rows.push({ ...base, direction: "out", account_id: fromAcc, category_id: transferCat, party_id: null, transfer_group: g });
      rows.push({ ...base, direction: "in", account_id: toAcc, category_id: transferCat, party_id: null, transfer_group: g });
      continue;
    }
    rows.push({ ...base, direction, account_id, category_id });
  }

  const { data, error } = await db.from("transactions").insert(rows).select("*");
  if (error) throw error;
  for (const t of data ?? []) await audit(ctx.company_id, ctx.uid, "transaction", t.id, "create", null, t);
  return (data ?? []).map(normTxn);
}

const EDITABLE = ["txn_date", "amount", "direction", "entry_type", "mode", "account_id", "party_id", "project_id", "stage_id", "category_id", "sub_category", "gst_rate", "gst_amount", "tds_amount", "bill_no", "reference", "due_date", "settles_bill", "notes", "attachments", "status", "is_approximate", "reconciled"] as const;

export async function updateEntry(ctx: Ctx, id: string, patch: Record<string, unknown>) {
  const db = sb();
  const { data: before } = await db.from("transactions").select("*").eq("id", id).eq("company_id", ctx.company_id).is("deleted_at", null).single();
  if (!before) throw new HttpError(404, "Entry not found");
  const isOwnPending = before.created_by === ctx.uid && before.status !== "confirmed";
  if (!(ctx.role === "owner" || ctx.role === "admin" || (ctx.role === "staff" && isOwnPending))) throw new HttpError(403, "Only the owner or admin can edit entries");
  const clean: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in patch) clean[k] = patch[k] === "" ? null : patch[k];
  if (ctx.role === "staff") delete clean.status;
  if ("amount" in clean && !(Number(clean.amount) > 0)) throw new HttpError(400, "Amount must be more than 0");
  clean.updated_by = ctx.uid;
  const { data, error } = await db.from("transactions").update(clean).eq("id", id).eq("company_id", ctx.company_id).select("*").single();
  if (error) throw error;
  await audit(ctx.company_id, ctx.uid, "transaction", id, clean.status === "confirmed" && before.status !== "confirmed" ? "confirm" : "update", before, data);
  // keep the other leg of a transfer in sync for amount/date
  if (before.transfer_group && ("amount" in clean || "txn_date" in clean)) {
    await db.from("transactions").update({ amount: data.amount, txn_date: data.txn_date, updated_by: ctx.uid })
      .eq("company_id", ctx.company_id).eq("transfer_group", before.transfer_group).neq("id", id);
  }
  return normTxn(data);
}

export async function deleteEntry(ctx: Ctx, id: string) {
  const db = sb();
  const { data: before } = await db.from("transactions").select("*").eq("id", id).eq("company_id", ctx.company_id).is("deleted_at", null).single();
  if (!before) throw new HttpError(404, "Entry not found");
  const ownPending = before.created_by === ctx.uid && before.status !== "confirmed";
  if (!(ctx.role === "owner" || ctx.role === "admin" || ownPending)) throw new HttpError(403, "Only the owner or admin can delete entries");
  const now = new Date().toISOString();
  const q = db.from("transactions").update({ deleted_at: now, deleted_by: ctx.uid }).eq("company_id", ctx.company_id);
  const { error } = before.transfer_group ? await q.eq("transfer_group", before.transfer_group) : await q.eq("id", id);
  if (error) throw error;
  await audit(ctx.company_id, ctx.uid, "transaction", id, "delete", before, null);
}
