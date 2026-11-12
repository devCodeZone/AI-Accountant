import { handle } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { deleteEntry, updateEntry } from "@/lib/txn-service";

type P = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: P) => {
  const s = await apiSession();
  const { id } = await params;
  return { entry: await updateEntry(s, id, await req.json()) };
});

export const DELETE = handle(async (_req: Request, { params }: P) => {
  const s = await apiSession();
  const { id } = await params;
  await deleteEntry(s, id);
  return { ok: true };
});
