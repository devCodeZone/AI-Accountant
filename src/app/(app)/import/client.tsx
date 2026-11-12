"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Select, cx } from "@/components/ui";
import type { RefsLite } from "@/components/entry-form";
import type { DraftEntry } from "@/lib/types";
import { bankLines, findHeaderRow, guessBankMap, guessLedgerMap, type BankMap, type LedgerMap } from "@/lib/import-utils";
import { dmy, inr } from "@/lib/format";

type Mode = "bank" | "ledger";
const BANK_FIELDS: [keyof BankMap, string][] = [["date", "Date *"], ["narration", "Narration *"], ["debit", "Withdrawal / Debit"], ["credit", "Deposit / Credit"], ["amount", "Amount (single column)"], ["type", "Dr/Cr column"], ["reference", "Ref / Cheque no."]];
const LEDGER_FIELDS: [keyof LedgerMap, string][] = [["date", "Date *"], ["amount", "Amount"], ["debit", "Paid / Out"], ["credit", "Received / In"], ["direction", "In/Out column"], ["mode", "Cash/Bank/UPI"], ["party", "Party / name"], ["project", "Project / site"], ["category", "Category / head"], ["notes", "Notes"], ["bill_no", "Bill no."]];

export function ImportClient({ refs }: { refs: RefsLite }) {
  const r = useRouter();
  const [mode, setMode] = useState<Mode>("bank");
  const [account, setAccount] = useState(refs.accounts.find((a) => a.type !== "cash")?.id ?? "");
  const [sheet, setSheet] = useState<{ names: string[]; data: Record<string, unknown[][]>; current: string } | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const rows = sheet ? sheet.data[sheet.current] : [];
  const hdrIdx = useMemo(() => findHeaderRow(rows), [rows]);
  const headers = (rows[hdrIdx] ?? []).map((h) => String(h ?? ""));
  const body = rows.slice(hdrIdx + 1);

  function loadSheet(names: string[], data: Record<string, unknown[][]>, current: string) {
    setSheet({ names, data, current });
    const rs = data[current];
    const h = (rs[findHeaderRow(rs)] ?? []).map((x) => String(x ?? ""));
    setMap(mode === "bank" ? guessBankMap(h) : guessLedgerMap(h));
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setMsg(""); setDrafts([]); setSheet(null);
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      if (mode !== "bank") return setMsg("For a ledger, upload the Excel / CSV file.");
      if (!account) return setMsg("Choose the bank account first");
      setBusy("Reading PDF with AI…");
      try {
        const fd = new FormData(); fd.append("file", f);
        const up = await fetch("/api/upload", { method: "POST", body: fd }); const u = await up.json();
        if (!up.ok) throw new Error(u.error);
        await prepare({ pdf_path: u.path });
      } catch (e: any) { setMsg(e.message); } finally { setBusy(""); }
      return;
    }
    setBusy("Opening file…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
      const data: Record<string, unknown[][]> = {};
      for (const n of wb.SheetNames) data[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }) as unknown[][];
      loadSheet(wb.SheetNames, data, wb.SheetNames[0]);
    } catch (e: any) { setMsg("Couldn't read that file: " + e.message); } finally { setBusy(""); }
  }

  async function prepare(payload: object) {
    const url = mode === "bank" ? "/api/import/bank" : "/api/import/ledger";
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account_id: account, ...payload }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error);
    setDrafts(j.drafts);
    setInclude(Object.fromEntries(j.drafts.map((d: DraftEntry) => [d.key, !d.duplicate_of])));
    setMsg(`${j.drafts.length} lines read${j.skipped?.length ? ` · ${j.skipped.length} rows skipped (no date/amount)` : ""}.${j.warning ? ` ${j.warning}` : ""}`);
  }

  async function read() {
    setBusy(mode === "bank" ? "Matching & categorising with AI…" : "Preparing preview…"); setMsg("");
    try {
      if (mode === "bank") {
        const lines = bankLines(body, map as BankMap);
        if (!lines.length) throw new Error("No rows with a date and amount — check the column mapping");
        await prepare({ lines });
      } else {
        const m = map as LedgerMap;
        const pick = (row: unknown[], k: keyof LedgerMap) => (m[k] >= 0 ? row[m[k]] : undefined);
        const out = body.filter((row) => row.some((c) => c !== "")).map((row) => Object.fromEntries(LEDGER_FIELDS.map(([k]) => [k, pick(row, k) instanceof Date ? pick(row, k) : pick(row, k)])));
        await prepare({ rows: out });
      }
    } catch (e: any) { setMsg(e.message); } finally { setBusy(""); }
  }

  async function commit(status: "confirmed" | "needs_review") {
    const chosen = drafts.filter((d) => include[d.key]);
    const reconcile = chosen.filter((d) => d.match_txn_id).map((d) => d.match_txn_id!);
    const create = chosen.filter((d) => !d.match_txn_id);
    setBusy("Saving…");
    try {
      const res = await fetch("/api/import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ drafts: create, reconcile, status }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMsg(`Saved ${j.saved} new entries${j.reconciled ? `, reconciled ${j.reconciled} existing` : ""}.`);
      setDrafts([]); setSheet(null); r.refresh();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(""); }
  }

  const upd = (key: string, p: Partial<DraftEntry>) => setDrafts((x) => x.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const catOpts = refs.categories;
  const nIn = drafts.filter((d) => include[d.key]).length;

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(["bank", "ledger"] as Mode[]).map((m) => (
          <button key={m} onClick={() => { setMode(m); setDrafts([]); setSheet(null); setMsg(""); }} className={cx("rounded-full border px-3 py-1 text-sm", mode === m ? "border-brand bg-brand text-white" : "border-line bg-white")}>{m === "bank" ? "Bank statement" : "Excel ledger"}</button>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        {mode === "bank" && (
          <Field label="Bank account"><Select value={account} onChange={(e) => setAccount(e.target.value)} className="max-w-sm">{refs.accounts.filter((a) => a.type !== "cash").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        )}
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line p-6 text-sm text-muted">
          <span className="text-2xl">⇪</span>
          {mode === "bank" ? "Upload statement — PDF, Excel (.xlsx/.xls) or CSV" : "Upload your current Excel / CSV ledger"}
          <input type="file" className="hidden" accept={mode === "bank" ? ".pdf,.xlsx,.xls,.csv" : ".xlsx,.xls,.csv"} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {busy && <div className="text-sm text-brand">{busy}</div>}
        {msg && <div className="text-sm">{msg}</div>}
      </Card>

      {sheet && !drafts.length && (
        <Card className="space-y-3 p-4">
          {sheet.names.length > 1 && <Field label="Sheet"><Select value={sheet.current} onChange={(e) => loadSheet(sheet.names, sheet.data, e.target.value)} className="max-w-xs">{sheet.names.map((n) => <option key={n}>{n}</option>)}</Select></Field>}
          <div className="text-sm font-semibold">Match your columns</div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {(mode === "bank" ? BANK_FIELDS : LEDGER_FIELDS).map(([k, label]) => (
              <Field key={k} label={label}>
                <Select value={map[k] ?? -1} onChange={(e) => setMap((x) => ({ ...x, [k]: Number(e.target.value) }))}>
                  <option value={-1}>—</option>{headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </Select>
              </Field>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="text-xs"><thead><tr>{headers.map((h, i) => <th key={i} className="whitespace-nowrap border-b border-line px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>{body.slice(0, 5).map((row, i) => <tr key={i}>{headers.map((_, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{row[j] instanceof Date ? (row[j] as Date).toLocaleDateString("en-IN") : String(row[j] ?? "")}</td>)}</tr>)}</tbody></table>
          </div>
          <Button onClick={read} disabled={!!busy || (map.date ?? -1) < 0}>Read {body.length} rows →</Button>
        </Card>
      )}

      {drafts.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm"><b>{nIn}</b> of {drafts.length} selected · <Badge tone="good">{drafts.filter((d) => d.match_txn_id).length} match existing</Badge> <Badge tone="bad">{drafts.filter((d) => d.duplicate_of).length} duplicates</Badge></div>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!!busy || !nIn} onClick={() => commit("needs_review")}>Save to Pending Review</Button>
              <Button disabled={!!busy || !nIn} onClick={() => commit("confirmed")}>Save as confirmed</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-1"><input type="checkbox" checked={nIn === drafts.length} onChange={(e) => setInclude(Object.fromEntries(drafts.map((d) => [d.key, e.target.checked])))} /></th><th className="p-1">Date</th><th className="p-1">Details</th><th className="p-1 text-right">Amount</th><th className="p-1">Category</th><th className="p-1">Party</th><th className="p-1">Status</th></tr></thead>
              <tbody className="divide-y divide-line">
                {drafts.map((d) => (
                  <tr key={d.key} className={cx(!include[d.key] && "opacity-50")}>
                    <td className="p-1"><input type="checkbox" checked={!!include[d.key]} onChange={(e) => setInclude((x) => ({ ...x, [d.key]: e.target.checked }))} /></td>
                    <td className="whitespace-nowrap p-1 text-xs">{dmy(d.txn_date)}</td>
                    <td className="max-w-[16rem] truncate p-1 text-xs" title={d.notes ?? ""}>{d.notes}</td>
                    <td className={cx("whitespace-nowrap p-1 text-right", d.direction === "in" ? "text-good" : "text-bad")}>{d.direction === "in" ? "+" : "−"}{inr(d.amount)}</td>
                    <td className="p-1">{d.match_txn_id ? <span className="text-xs text-muted">already entered</span> : (
                      <select className="h-8 max-w-[11rem] rounded-lg border border-line text-xs" value={d.is_transfer ? "__t" : d.category_id ?? ""} onChange={(e) => e.target.value === "__t"
                        ? upd(d.key, { is_transfer: true, category_id: refs.categories.find((c) => c.is_transfer)?.id ?? null, party_id: null, party_name: null })
                        : upd(d.key, { is_transfer: false, category_id: e.target.value || null })}>
                        <option value="">Uncategorised</option><option value="__t">⇄ Transfer (cash/own account)</option>
                        {catOpts.filter((c) => !c.is_transfer && (d.direction === "in" ? c.kind !== "expense" : c.kind !== "income")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>)}
                    </td>
                    <td className="p-1"><input className="h-8 w-32 rounded-lg border border-line px-1 text-xs" value={d.party_name ?? refs.parties.find((p) => p.id === d.party_id)?.name ?? ""} disabled={d.is_transfer || !!d.match_txn_id}
                      onChange={(e) => { const m = refs.parties.find((p) => p.name.toLowerCase() === e.target.value.toLowerCase()); upd(d.key, { party_id: m?.id ?? null, party_name: e.target.value || null }); }} /></td>
                    <td className="p-1">{d.duplicate_of ? <Badge tone="bad">duplicate</Badge> : d.match_txn_id ? <Badge tone="good">reconcile</Badge> : <Badge tone={d.confidence >= 0.8 ? "good" : "warn"}>{Math.round(d.confidence * 100)}%</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mode === "bank" && <p className="text-xs text-muted">Lines that match an entry you already typed (same amount & direction within 3 days) are marked reconciled instead of being added again. A transfer line adds the other leg in your default cash account.</p>}
        </Card>
      )}
    </div>
  );
}
