import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { saveEntries } from "@/lib/txn-service";
import { sb } from "@/lib/supabase";
import { audit } from "@/lib/db";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  assert(can.editEntries(s.role));
  const { drafts = [], reconcile = [], status = "needs_review" } = await req.json();
  if (!drafts.length && !reconcile.length) bad("Nothing selected");
  let saved = 0;
  for (let i = 0; i < drafts.length; i += 200) {
    const out = await saveEntries(s, drafts.slice(i, i + 200).map((d: any) => ({ ...d, status: status === "confirmed" ? "confirmed" : "needs_review" })));
    saved += out.length;
  }
  if (reconcile.length) {
    await sb().from("transactions").update({ reconciled: true, updated_by: s.uid }).eq("company_id", s.company_id).in("id", reconcile);
  }
  await audit(s.company_id, s.uid, "import", null, "import", null, { saved, reconciled: reconcile.length });
  return { saved, reconciled: reconcile.length };
});
