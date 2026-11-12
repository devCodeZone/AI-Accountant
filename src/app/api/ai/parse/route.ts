import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { getRefs } from "@/lib/refs";
import { getCompany } from "@/lib/db";
import { sb, BUCKET } from "@/lib/supabase";
import { extractEntries } from "@/lib/ai/extract";
import type { Part } from "@/lib/ai/gemini";
import type { Source } from "@/lib/types";

export const maxDuration = 60;

/** Returns DRAFTS only. Nothing is written to the ledger here — the user confirms on the next screen. */
export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  assert(can.addEntries(s.role));
  const body = await req.json();
  const parts: Part[] = [];
  let source: Source = "typed";
  const paths: string[] = Array.isArray(body.paths) ? body.paths.slice(0, 4) : [];

  for (const p of paths) {
    if (typeof p !== "string" || !p.startsWith(`${s.company_id}/`)) bad("Bad file");
    const { data, error } = await sb().storage.from(BUCKET).download(p);
    if (error || !data) bad("Could not read the uploaded file");
    parts.push({ inlineData: { mimeType: data.type || (p.endsWith(".pdf") ? "application/pdf" : "image/jpeg"), data: Buffer.from(await data.arrayBuffer()).toString("base64") } });
    source = "photo";
  }
  if (body.audio?.data) {
    if (String(body.audio.data).length > 6_000_000) bad("Recording too long — keep it under a minute");
    parts.push({ inlineData: { mimeType: String(body.audio.mime || "audio/webm").split(";")[0], data: body.audio.data } });
    parts.push({ text: "Transcribe this voice note (it may be Hindi, English or Hinglish), then extract the entries." });
    source = "voice";
  }
  if (body.text?.trim()) {
    parts.push({ text: String(body.text).slice(0, 4000) });
    if (body.voice) source = "voice";
  }
  if (!parts.length) bad("Type, speak or upload something first");
  if (paths.length && !body.text) parts.push({ text: "Read this bill / receipt / screenshot and extract the entry." });

  const [refs, company] = await Promise.all([getRefs(s.company_id), getCompany(s.company_id)]);
  const { transcript, drafts } = await extractEntries(refs, company.name, parts, source, paths);
  return { transcript, drafts };
});
