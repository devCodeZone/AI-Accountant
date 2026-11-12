import * as XLSX from "xlsx";
import { apiSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadBook } from "@/lib/db";
import { workbookSheets } from "@/lib/reports";
import { fyOf, fyRange, todayISO } from "@/lib/format";

export async function GET(req: Request) {
  const s = await apiSession().catch(() => null);
  if (!s || !can.export(s.role)) return new Response("Not allowed", { status: 403 });
  const b = await loadBook(s.company_id);
  const u = new URL(req.url).searchParams;
  const fy = fyRange(fyOf(todayISO(), b.company.fy_start_month), b.company.fy_start_month);
  const from = u.get("from") || fy.from, to = u.get("to") || fy.to;
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(workbookSheets(b, from, to))) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = (rows[0] ?? []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const fname = `${b.company.name.replace(/[^\w]+/g, "-")}-accounts-${from}-to-${to}.xlsx`;
  return new Response(buf, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${fname}"` } });
}
