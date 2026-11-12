"use client";
const KEY = "acct_offline_queue_v1";

export type Queued = { id: string; kind: "entry" | "note"; payload: any; at: number };

export function readQueue(): Queued[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(q: Queued[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); window.dispatchEvent(new Event("acct-queue")); } catch {}
}
export function enqueue(kind: Queued["kind"], payload: any) {
  write([...readQueue(), { id: Math.random().toString(36).slice(2), kind, payload, at: Date.now() }]);
}
export function removeQueued(id: string) {
  write(readQueue().filter((q) => q.id !== id));
}

/** Push queued manual entries (saved as needs_review so the owner checks them). Notes need AI, so they wait on the Add screen. */
export async function flushEntries(): Promise<number> {
  const q = readQueue().filter((x) => x.kind === "entry");
  if (!q.length || !navigator.onLine) return 0;
  let sent = 0;
  for (const item of q) {
    try {
      const res = await fetch("/api/transactions", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries: [{ ...item.payload, status: "needs_review" }] }) });
      if (res.ok) { removeQueued(item.id); sent++; }
    } catch { break; }
  }
  return sent;
}
