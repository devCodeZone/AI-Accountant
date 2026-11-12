import Link from "next/link";
import type { Txn } from "@/lib/types";
import { describe, type Index } from "@/lib/ledger";
import { dmy } from "@/lib/format";
import { Badge, Money, Table, Td } from "./ui";

export function TxnTable({ rows, ix, balance, showMode = true }: { rows: { t: Txn; balance?: number }[]; ix: Index; balance?: boolean; showMode?: boolean }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">No entries.</p>;
  return (
    <Table head={["Date", "Details", ...(showMode ? ["Mode"] : []), "In", "Out", ...(balance ? ["Balance"] : [])]}>
      {rows.map(({ t, balance: bal }) => (
        <tr key={t.id} className="hover:bg-stone-50">
          <Td className="whitespace-nowrap text-muted">{dmy(t.txn_date)}</Td>
          <Td>
            <Link href={`/transactions/${t.id}`} className="block min-w-[10rem]">
              <div>{describe(t, ix)}</div>
              <div className="text-xs text-muted">
                {[t.notes, t.bill_no && `Bill ${t.bill_no}`, t.reference].filter(Boolean).join(" · ")}
                {t.entry_type !== "money" && <Badge className="ml-1">{t.entry_type === "vendor_bill" ? "credit bill" : "work done"}</Badge>}
                {t.attachments.length > 0 && " 📎"}
                {t.is_approximate && <Badge tone="warn" className="ml-1">approx</Badge>}
              </div>
            </Link>
          </Td>
          {showMode && <Td className="text-xs uppercase text-muted">{t.mode ?? "—"}</Td>}
          <Td className="text-right">{t.direction === "in" ? <Money v={t.amount} className="text-good" /> : ""}</Td>
          <Td className="text-right">{t.direction === "out" ? <Money v={t.amount} className="text-bad" /> : ""}</Td>
          {balance && <Td className="text-right font-medium"><Money v={bal ?? 0} /></Td>}
        </tr>
      ))}
    </Table>
  );
}
