import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { loadBook } from "@/lib/db";
import { askAccounts } from "@/lib/ai/chat";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  assert(can.viewFinancials(s.role));
  const { question, history = [] } = await req.json();
  if (!question?.trim()) bad("Ask a question");
  const b = await loadBook(s.company_id);
  return askAccounts(b, history, String(question).slice(0, 1000));
});
