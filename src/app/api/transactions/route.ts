import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { saveEntries } from "@/lib/txn-service";

export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  const body = await req.json();
  const entries = Array.isArray(body.entries) ? body.entries : body.entry ? [body.entry] : [];
  if (!entries.length) bad("Nothing to save");
  if (entries.length > 500) bad("Too many entries at once (max 500)");
  const saved = await saveEntries(s, entries);
  return { saved: saved.length, ids: saved.map((t) => t.id) };
});
