"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Input } from "@/components/ui";

type Msg = { role: "user" | "assistant"; text: string; used?: { tool: string; args: object; result: unknown }[] };
const SUGGEST = ["How much did we spend on plywood in October?", "Which project is least profitable?", "Who owes us money?", "Is mahine kitna profit hua?", "How much have we paid Ramesh this year?", "What's our cash and bank balance?"];

export function ChatClient() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    const history = msgs.map(({ role, text }) => ({ role, text }));
    setMsgs((m) => [...m, { role: "user", text }]); setQ(""); setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text, history }) });
      const j = await res.json();
      setMsgs((m) => [...m, res.ok ? { role: "assistant", text: j.answer, used: j.used } : { role: "assistant", text: `⚠ ${j.error}` }]);
    } catch { setMsgs((m) => [...m, { role: "assistant", text: "⚠ Network error" }]); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3" style={{ minHeight: "calc(100dvh - 11rem)" }}>
      <div>
        <h1 className="text-xl font-semibold">Ask your accounts</h1>
        <p className="text-sm text-muted">Answers are calculated from your own entries — the AI never makes up numbers. Tap “numbers used” to check.</p>
      </div>
      <div className="flex-1 space-y-3">
        {!msgs.length && (
          <div className="flex flex-wrap gap-2 pt-4">
            {SUGGEST.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-sm">{s}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <Card className={m.role === "user" ? "max-w-[85%] bg-brand p-3 text-sm text-white" : "max-w-[95%] p-3 text-sm"}>
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.used && m.used.length > 0 && (
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer">Numbers used ({m.used.length} {m.used.length === 1 ? "query" : "queries"})</summary>
                  {m.used.map((u, j) => (
                    <div key={j} className="mt-2">
                      <div className="font-medium">{u.tool}({Object.entries(u.args).map(([k, v]) => `${k}: ${v}`).join(", ")})</div>
                      <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-stone-50 p-2 text-[11px]">{JSON.stringify(u.result, null, 1)}</pre>
                    </div>
                  ))}
                </details>
              )}
            </Card>
          </div>
        ))}
        {busy && <Card className="w-24 p-3 text-sm text-muted">Thinking…</Card>}
        <div ref={end} />
      </div>
      <form className="sticky bottom-20 flex gap-2 rounded-2xl border border-line bg-white p-2 shadow-sm md:bottom-4" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about your money…" className="border-0 focus:ring-0" />
        <Button disabled={busy || !q.trim()}>Ask</Button>
      </form>
    </div>
  );
}
