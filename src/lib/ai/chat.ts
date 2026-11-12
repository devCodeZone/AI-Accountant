import "server-only";
import { generate, textOf, type Content } from "./gemini";
import type { Book } from "../db";
import { similarity } from "../db";
import { cashAndBank, catName, describe, gstSummary, groupOf, indexBook, isPL, monthlyIncomeExpense, payables, pnl, projectStats, receivables } from "../ledger";
import { dmy, fyOf, fyRange, lastNMonths, round2, todayISO } from "../format";

const STR = { type: "STRING" };
const range = { from: { ...STR, description: "YYYY-MM-DD" }, to: { ...STR, description: "YYYY-MM-DD" } };

const TOOLS = [
  { name: "summary", description: "Income, expenses and net profit (cash basis) for a period, with totals per group.", parameters: { type: "OBJECT", properties: { ...range, project: { ...STR, description: "project name (optional)" } } } },
  { name: "spend_by_category", description: "Money spent (or received) per category for a period. Use for 'how much did we spend on X'.", parameters: { type: "OBJECT", properties: { ...range, category: { ...STR, description: "category or group text to filter, e.g. plywood, labour, overheads" }, project: STR, direction: { type: "STRING", enum: ["in", "out"] } } } },
  { name: "project_profitability", description: "Every project's contract, received, spent, profit and margin.", parameters: { type: "OBJECT", properties: {} } },
  { name: "receivables", description: "Which clients owe money now, with ageing.", parameters: { type: "OBJECT", properties: {} } },
  { name: "payables", description: "What we owe vendors and labour/contractors (and advances given).", parameters: { type: "OBJECT", properties: { type: { type: "STRING", enum: ["vendor", "labour", "all"] } } } },
  { name: "balances", description: "Current cash in hand and bank balances per account.", parameters: { type: "OBJECT", properties: {} } },
  { name: "find_entries", description: "Search individual entries. Returns matching entries and their total.", parameters: { type: "OBJECT", properties: { ...range, party: STR, category: STR, project: STR, text: STR, direction: { type: "STRING", enum: ["in", "out"] }, min_amount: { type: "NUMBER" }, limit: { type: "INTEGER" } } } },
  { name: "gst", description: "Output GST, input GST and net payable by month.", parameters: { type: "OBJECT", properties: range } },
  { name: "monthly", description: "Income and expense for each of the last N months.", parameters: { type: "OBJECT", properties: { months: { type: "INTEGER" } } } },
];

type Args = Record<string, any>;

export function runTool(b: Book, name: string, a: Args) {
  const ix = indexBook(b);
  const today = todayISO();
  const fy = fyRange(fyOf(today, b.company.fy_start_month), b.company.fy_start_month);
  const from = a.from || fy.from, to = a.to || today;
  const proj = a.project ? b.projects.map((p) => ({ p, s: similarity(a.project, p.name) })).sort((x, y) => y.s - x.s)[0] : null;
  const projectId = proj && proj.s > 0.35 ? proj.p.id : undefined;
  const textMatch = (q: string | undefined, s: string) => !q || s.toLowerCase().includes(q.toLowerCase()) || similarity(q, s) > 0.55;

  switch (name) {
    case "summary": {
      const p = pnl(b, from, to, projectId);
      return { period: `${dmy(from)} to ${dmy(to)}`, project: projectId ? ix.project.get(projectId)?.name : "all", income: p.income, expense: p.expense, net_profit: p.net, margin_pct: p.margin, by_group: p.byGroup };
    }
    case "spend_by_category": {
      const dir = a.direction ?? "out";
      const m = new Map<string, { group: string; amount: number; count: number }>();
      for (const t of b.txns) {
        if (!isPL(t, ix) || t.direction !== dir || t.txn_date < from || t.txn_date > to) continue;
        if (projectId && t.project_id !== projectId) continue;
        const c = catName(t, ix), g = groupOf(t, ix);
        if (a.category && !textMatch(a.category, c) && !textMatch(a.category, g)) continue;
        const r = m.get(c) ?? { group: g, amount: 0, count: 0 };
        r.amount += t.amount; r.count++;
        m.set(c, r);
      }
      const rows = [...m].map(([category, v]) => ({ category, ...v, amount: round2(v.amount) })).sort((x, y) => y.amount - x.amount);
      return { period: `${dmy(from)} to ${dmy(to)}`, direction: dir, project: projectId ? ix.project.get(projectId)?.name : "all", total: round2(rows.reduce((s, r) => s + r.amount, 0)), rows: rows.slice(0, 25) };
    }
    case "project_profitability":
      return projectStats(b).map((x) => ({ project: x.project.name, status: x.project.status, client: x.client?.name, contract: x.contract, received: x.received, spent: x.spent, cash_profit: x.profit, expected_profit: x.expectedProfit, expected_margin_pct: x.expectedMargin, to_collect: x.pendingFromClient, over_budget: x.overrun }));
    case "receivables":
      return receivables(b).filter((r) => r.outstanding > 0 || r.contractBalance > 0).slice(0, 25).map((r) => ({ client: r.party?.name, due_now: r.outstanding, ageing: r.buckets, oldest_days: r.oldestDays, received: r.received, left_on_contract: r.contractBalance, phone: r.party?.phone }));
    case "payables": {
      const types = a.type === "vendor" ? ["vendor"] : a.type === "labour" ? ["labour"] : ["vendor", "labour"];
      return types.flatMap((t) => payables(b, t as "vendor" | "labour")).filter((p) => p.balance !== 0).slice(0, 25).map((p) => ({ name: p.party.name, type: p.party.type, balance: p.balance, meaning: p.balance > 0 ? "we owe them" : "advance given", paid_this_fy: p.fyTotal, tds_flag: p.tdsFlag }));
    }
    case "balances": {
      const cb = cashAndBank(b);
      return { cash_in_hand: cb.cash, bank_total: cb.bank, accounts: cb.rows.map((r) => ({ account: r.account.name, type: r.account.type, balance: r.balance })) };
    }
    case "find_entries": {
      const list = b.txns.filter((t) => t.txn_date >= from && t.txn_date <= to
        && (!a.direction || t.direction === a.direction)
        && (!projectId || t.project_id === projectId)
        && (!a.min_amount || t.amount >= a.min_amount)
        && (!a.party || (t.party_id && textMatch(a.party, ix.party.get(t.party_id)?.name ?? "")))
        && (!a.category || textMatch(a.category, catName(t, ix)) || textMatch(a.category, groupOf(t, ix)))
        && (!a.text || `${t.notes ?? ""} ${describe(t, ix)}`.toLowerCase().includes(String(a.text).toLowerCase())));
      const limit = Math.min(Number(a.limit) || 15, 40);
      return { period: `${dmy(from)} to ${dmy(to)}`, count: list.length, total_in: round2(list.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0)), total_out: round2(list.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0)),
        entries: list.slice(-limit).reverse().map((t) => ({ date: dmy(t.txn_date), amount: t.amount, direction: t.direction, type: t.entry_type, mode: t.mode, details: describe(t, ix), notes: t.notes })) };
    }
    case "gst": {
      const g = gstSummary(b, from, to);
      return { period: `${dmy(from)} to ${dmy(to)}`, gst_registered: !!b.company.gstin, output: g.output, input: g.input, net_payable: g.net, months: g.months.map((m) => ({ month: m.month, output: m.output, input: m.input, net: m.net })) };
    }
    case "monthly":
      return monthlyIncomeExpense(b, lastNMonths(Math.min(Number(a.months) || 12, 24)));
    default:
      return { error: "unknown tool" };
  }
}

export type ChatTurn = { role: "user" | "assistant"; text: string };

export async function askAccounts(b: Book, history: ChatTurn[], question: string) {
  const today = todayISO();
  const fy = fyOf(today, b.company.fy_start_month);
  const system = `You are the in-house accountant for "${b.company.name}" (Indian interior design business). Today is ${dmy(today)}; current financial year ${fy} (starts month ${b.company.fy_start_month}).
Answer ONLY from tool results — call tools to get every number. Never guess or invent figures. If tools return nothing relevant, say so.
If no period is given, use the current financial year and say so. "October" means October of the current year unless it's in the future.
Reply in the user's language (English, Hindi or Hinglish). Be brief: lead with the answer, then a short list of the key numbers used. Use Indian formatting like ₹1,20,000 and dates DD-MM-YYYY.
Profit is cash basis (money actually received and paid). You cannot change any entries.`;
  const contents: Content[] = [
    ...history.slice(-6).map((h) => ({ role: (h.role === "assistant" ? "model" : "user") as Content["role"], parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: question }] },
  ];
  const used: { tool: string; args: Args; result: unknown }[] = [];
  for (let step = 0; step < 6; step++) {
    const resp = await generate({ systemInstruction: { parts: [{ text: system }] }, contents, tools: [{ functionDeclarations: TOOLS }], generationConfig: { temperature: 0.1 } });
    const content = resp?.candidates?.[0]?.content;
    const calls = (content?.parts ?? []).filter((p: any) => p.functionCall);
    if (!calls.length) return { answer: textOf(resp) || "I couldn't work that out — try asking differently.", used };
    contents.push(content);
    const responses = calls.map((p: any) => {
      const result = runTool(b, p.functionCall.name, p.functionCall.args ?? {});
      used.push({ tool: p.functionCall.name, args: p.functionCall.args ?? {}, result });
      return { functionResponse: { name: p.functionCall.name, response: { result } } };
    });
    contents.push({ role: "user", parts: responses });
  }
  return { answer: "That needed too many steps — please ask a more specific question.", used };
}
