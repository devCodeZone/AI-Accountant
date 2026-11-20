"use client";
/** fetch + JSON that never throws "Unexpected token" when the server returns a plain-text error page. */
export async function postJson<T = any>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, data: { error: "Network error — check your internet connection." } as any };
  }
  const text = await res.text();
  try {
    return { ok: res.ok, data: JSON.parse(text) };
  } catch {
    const msg = res.status === 504 ? "The AI took too long. Try a shorter message, or split it into smaller parts."
      : res.status === 413 ? "That's too large to send at once."
      : `Server error (${res.status}). Please try again.`;
    return { ok: false, data: { error: msg } as any };
  }
}

const WA_MSG = /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}/;

/**
 * Split long pasted text (e.g. a WhatsApp chat export) into parts the AI can read
 * within the time limit. WhatsApp messages are never cut in half.
 */
export function splitForAi(text: string, maxChars = 1800): string[] {
  const lines = text.split(/\r?\n/);
  // Group lines into units: one WhatsApp message (with its continuation lines), or one plain line.
  const units: string[] = [];
  const isWa = lines.filter((l) => WA_MSG.test(l)).length >= 3;
  for (const line of lines) {
    if (isWa && units.length && !WA_MSG.test(line)) units[units.length - 1] += "\n" + line;
    else units.push(line);
  }
  const parts: string[] = [];
  let cur = "";
  for (const u of units) {
    const pieces = u.length > maxChars ? u.match(new RegExp(`[\\s\\S]{1,${maxChars}}`, "g")) ?? [u] : [u];
    for (const p of pieces) {
      if (cur && cur.length + p.length + 1 > maxChars) { parts.push(cur); cur = ""; }
      cur += (cur ? "\n" : "") + p;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts.filter((p) => p.trim());
}

/** The last few messages of a part, sent with the next part so the AI knows who "10000 cash, total 119500" belongs to. */
export function tailContext(part: string, maxChars = 900): string {
  return part.length <= maxChars ? part : part.slice(part.length - maxChars);
}
