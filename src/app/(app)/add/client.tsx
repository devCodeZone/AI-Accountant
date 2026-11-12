"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Textarea, cx } from "@/components/ui";
import { DraftCard, EntryForm, SaveBar, blankDraft, type RefsLite } from "@/components/entry-form";
import type { DraftEntry } from "@/lib/types";
import { compressImage, blobToBase64 } from "@/lib/image";
import { enqueue, readQueue, removeQueued, type Queued } from "@/lib/offline";

type Tab = "speak" | "type" | "photo" | "manual";
const TABS: { k: Tab; label: string; icon: string }[] = [
  { k: "speak", label: "Speak", icon: "🎙" }, { k: "type", label: "Type", icon: "⌨" }, { k: "photo", label: "Bill photo", icon: "📷" }, { k: "manual", label: "Form", icon: "✎" },
];
const EXAMPLES = [
  "Gave 20k cash to Ramesh carpenter for Sharma Sector 56 site",
  "Neha Gupta ne 1.36 lakh UPI se bheje kitchen ke liye",
  "I think I paid the electrician around 8k last week",
  "Petrol 1500 cash, tea for site 300",
];

export function AddClient({ refs, initialTab }: { refs: RefsLite; initialTab: Tab }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [manual, setManual] = useState<DraftEntry>(blankDraft());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [notes, setNotes] = useState<Queued[]>([]);

  useEffect(() => {
    const r = () => setNotes(readQueue().filter((q) => q.kind === "note"));
    r(); window.addEventListener("acct-queue", r); return () => window.removeEventListener("acct-queue", r);
  }, []);

  async function parse(body: object, keepText?: string) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/ai/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      if (j.transcript && keepText === undefined) setText(j.transcript);
      if (!j.drafts.length) setMsg({ tone: "err", text: "Couldn't find an amount. Try saying who, how much and for which site." });
      setDrafts((d) => [...d, ...j.drafts]);
      return true;
    } catch (e: any) {
      setMsg({ tone: "err", text: e.message });
      return false;
    } finally { setBusy(false); }
  }

  async function parseText(voice = false) {
    if (!text.trim()) return;
    if (!navigator.onLine) { enqueue("note", { text, voice }); setText(""); setMsg({ tone: "ok", text: "Saved on this phone. Process it when you're online." }); return; }
    if (await parse({ text, voice }, text)) setText("");
  }

  async function save(list: DraftEntry[], status: "confirmed" | "needs_review") {
    if (list.some((d) => !(d.amount > 0))) { setMsg({ tone: "err", text: "Every entry needs an amount" }); return false; }
    setBusy(true); setMsg(null);
    try {
      if (!navigator.onLine) {
        list.forEach((d) => enqueue("entry", { ...d, status: "needs_review" }));
        setMsg({ tone: "ok", text: "Offline — saved on this phone, will sync automatically." });
        return true;
      }
      const res = await fetch("/api/transactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entries: list.map((d) => ({ ...d, status })) }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMsg({ tone: "ok", text: `Saved ${j.saved} entr${j.saved === 1 ? "y" : "ies"}${status === "needs_review" ? " to Pending Review" : ""}.` });
      router.refresh();
      return true;
    } catch (e: any) { setMsg({ tone: "err", text: e.message }); return false; } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-stone-100 p-1">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={cx("rounded-xl py-2 text-xs font-medium", tab === t.k ? "bg-white shadow-sm" : "text-muted")}>
            <div className="text-base">{t.icon}</div>{t.label}
          </button>
        ))}
      </div>

      {notes.length > 0 && (
        <Card className="space-y-2 p-3">
          <div className="text-xs font-medium text-muted">Saved while offline</div>
          {notes.map((n) => (
            <div key={n.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{n.payload.text}</span>
              <Button size="sm" disabled={busy} onClick={async () => { if (await parse({ text: n.payload.text, voice: n.payload.voice }, "")) removeQueued(n.id); }}>Process</Button>
            </div>
          ))}
        </Card>
      )}

      {tab === "speak" && <Voice busy={busy} onTranscript={(t) => setText((x) => (x ? x + " " : "") + t)} onAudio={(data, mime) => parse({ audio: { data, mime } })} />}

      {(tab === "speak" || tab === "type") && (
        <Card className="space-y-3 p-4">
          <Textarea rows={tab === "type" ? 4 : 3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={tab === "speak" ? "Your words appear here — edit if needed" : "e.g. Gave 20k cash to Ramesh carpenter for Sharma Sector 56 site"} />
          <Button className="w-full" size="lg" disabled={busy || !text.trim()} onClick={() => parseText(tab === "speak")}>{busy ? "Reading…" : "✦ Make entries"}</Button>
          {tab === "type" && !drafts.length && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => <button key={e} onClick={() => setText(e)} className="rounded-full border border-line px-2.5 py-1 text-left text-xs text-muted">{e}</button>)}
            </div>
          )}
        </Card>
      )}

      {tab === "photo" && <Photo busy={busy} setBusy={setBusy} onPaths={(paths, note) => parse({ paths, text: note || undefined }, "")} onError={(t) => setMsg({ tone: "err", text: t })} />}

      {tab === "manual" && (
        <Card className="space-y-4 p-4">
          <EntryForm value={manual} onChange={setManual} refs={refs} />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" disabled={busy} onClick={async () => { if (await save([manual], "needs_review")) setManual(blankDraft()); }}>Save for review</Button>
            <Button className="flex-1" disabled={busy} onClick={async () => { if (await save([manual], "confirmed")) setManual(blankDraft({ mode: manual.mode, direction: manual.direction, project_id: manual.project_id })); }}>Save entry</Button>
          </div>
        </Card>
      )}

      {msg && <div className={cx("rounded-xl p-3 text-sm", msg.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{msg.text}</div>}

      {drafts.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium">Check these before saving <span className="text-muted">— nothing is saved until you confirm</span></div>
          {drafts.map((d, i) => (
            <DraftCard key={d.key} draft={d} refs={refs}
              onChange={(nd) => setDrafts((x) => x.map((y, j) => (j === i ? nd : y)))}
              onRemove={() => setDrafts((x) => x.filter((_, j) => j !== i))} />
          ))}
          <SaveBar count={drafts.length} busy={busy} onSave={async (status) => { if (await save(drafts, status)) setDrafts([]); }} />
        </div>
      )}
    </div>
  );
}

function Voice({ busy, onTranscript, onAudio }: { busy: boolean; onTranscript: (t: string) => void; onAudio: (b64: string, mime: string) => void }) {
  const [rec, setRec] = useState(false);
  const [interim, setInterim] = useState("");
  const [lang, setLang] = useState<"hi-IN" | "en-IN">("hi-IN");
  const srRef = useRef<any>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const [SR, setSR] = useState<any>(null);
  useEffect(() => { setSR(() => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null); }, []);

  function start() {
    if (SR) {
      const sr = new SR();
      sr.lang = lang; sr.continuous = true; sr.interimResults = true;
      sr.onresult = (e: any) => {
        let fin = "", tmp = "";
        for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (tmp += e.results[i][0].transcript));
        if (fin) onTranscript(fin.trim());
        setInterim(tmp);
      };
      sr.onend = () => { setRec(false); setInterim(""); };
      sr.onerror = () => setRec(false);
      sr.start(); srRef.current = sr; setRec(true);
      return;
    }
    // Fallback: record audio and let Gemini transcribe it
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        onAudio(await blobToBase64(blob), blob.type);
      };
      mr.start(); mrRef.current = mr; setRec(true);
      setTimeout(() => mr.state === "recording" && mr.stop(), 60000);
    }).catch(() => alert("Microphone permission is needed"));
  }
  function stop() {
    srRef.current?.stop();
    if (mrRef.current?.state === "recording") mrRef.current.stop();
    setRec(false);
  }

  return (
    <Card className="flex flex-col items-center gap-3 p-6">
      <button onClick={rec ? stop : start} disabled={busy}
        className={cx("flex h-24 w-24 items-center justify-center rounded-full text-4xl text-white shadow-lg transition", rec ? "animate-pulse bg-bad" : "bg-brand")}>
        {rec ? "■" : "🎙"}
      </button>
      <div className="text-center text-sm text-muted">
        {rec ? (interim || "Listening… say who, how much, and which site") : "Tap and speak — Hindi, English or Hinglish"}
      </div>
      {SR && !rec && (
        <div className="flex gap-1 text-xs">
          {(["hi-IN", "en-IN"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={cx("rounded-full border px-2 py-0.5", lang === l ? "border-ink" : "border-line text-muted")}>{l === "hi-IN" ? "हिंदी / Hinglish" : "English"}</button>
          ))}
        </div>
      )}
    </Card>
  );
}

function Photo({ busy, setBusy, onPaths, onError }: { busy: boolean; setBusy: (b: boolean) => void; onPaths: (p: string[], note: string) => void; onError: (t: string) => void }) {
  const [files, setFiles] = useState<{ path: string; preview: string }[]>([]);
  const [note, setNote] = useState("");
  async function add(list: FileList | null) {
    if (!list) return;
    setBusy(true);
    try {
      for (const f of Array.from(list).slice(0, 4)) {
        const blob = f.type.startsWith("image/") ? await compressImage(f) : f;
        const fd = new FormData(); fd.append("file", blob, f.name);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        setFiles((x) => [...x, { path: j.path, preview: f.type.startsWith("image/") ? URL.createObjectURL(blob) : "" }]);
      }
    } catch (e: any) { onError(e.message); } finally { setBusy(false); }
  }
  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm text-muted">Printed bill, handwritten kachha slip, GPay/PhonePe screenshot or cheque. The photo is kept as proof.</p>
      <div className="flex flex-wrap gap-2">
        {files.map((f) => f.preview
          // eslint-disable-next-line @next/next/no-img-element
          ? <img key={f.path} src={f.preview} alt="" className="h-24 w-20 rounded-lg object-cover" />
          : <div key={f.path} className="flex h-24 w-20 items-center justify-center rounded-lg bg-stone-100 text-xs">PDF</div>)}
        <label className="flex h-24 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line text-xs text-muted">
          <span className="text-2xl">+</span>Camera
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => add(e.target.files)} />
        </label>
        <label className="flex h-24 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line text-xs text-muted">
          <span className="text-2xl">⇪</span>Gallery
          <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => add(e.target.files)} />
        </label>
      </div>
      <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note, e.g. 'for Mehta office site, paid cash'" />
      <Button className="w-full" size="lg" disabled={busy || !files.length} onClick={() => { onPaths(files.map((f) => f.path), note); setFiles([]); setNote(""); }}>{busy ? "Reading…" : "✦ Read bill"}</Button>
    </Card>
  );
}
