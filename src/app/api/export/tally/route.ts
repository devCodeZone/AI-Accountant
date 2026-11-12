import { apiSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadBook } from "@/lib/db";
import { tallyCsv } from "@/lib/reports";
import { fyOf, fyRange, todayISO } from "@/lib/format";

export async function GET(req: Request) {
  const s = await apiSession().catch(() => null);
  if (!s || !can.export(s.role)) return new Response("Not allowed", { status: 403 });
  const b = await loadBook(s.company_id);
  const u = new URL(req.url).searchParams;
  const fy = fyRange(fyOf(todayISO(), b.company.fy_start_month), b.company.fy_start_month);
  const from = u.get("from") || fy.from, to = u.get("to") || fy.to;
  return new Response("﻿" + tallyCsv(b, from, to), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="tally-${from}-to-${to}.csv"` } });
}
