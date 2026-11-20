import "server-only";

// Thin Gemini REST client (no SDK needed). Model is configurable; "gemini-flash-latest"
// always points to Google's current Flash model and works on the free tier.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const model = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

/** Tried in order when the main model is overloaded (503), rate-limited (429) or unavailable (404). */
const models = () => {
  const extra = (process.env.GEMINI_FALLBACK_MODELS || "gemini-flash-lite-latest,gemini-2.5-flash")
    .split(",").map((m) => m.trim()).filter(Boolean);
  return [...new Set([model(), ...extra])];
};

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
export type Content = { role: "user" | "model"; parts: Part[] };

export class AiError extends Error {}

/**
 * Vercel stops a function after maxDuration (60s on our routes). We give Gemini a
 * total time budget below that, so the user gets a clear message instead of a 504.
 */
export async function generate(body: Record<string, unknown>, budgetMs = 50_000): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError("GEMINI_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.");
  const deadline = Date.now() + budgetMs;
  const list = models();
  let lastErr = "";
  // Up to 2 rounds through the model list; a busy model hands over to the next one.
  for (let attempt = 0; attempt < list.length * 2; attempt++) {
    const m = list[attempt % list.length];
    const remaining = deadline - Date.now();
    if (remaining < 4000) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), remaining);
    let res: Response;
    try {
      res = await fetch(`${BASE}/${m}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e: any) {
      if (e?.name === "AbortError") throw new AiError("The AI took too long. Try a shorter message, or split it into smaller parts.");
      lastErr = String(e?.message ?? e);
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return res.json();
    lastErr = await res.text();
    const busy = res.status === 429 || res.status >= 500;
    if (busy || res.status === 404) {
      // after a full round of busy models, pause briefly before the second round
      if (busy && (attempt + 1) % list.length === 0) await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    break; // 400/401/403: a real problem (bad key, bad request) — no point retrying
  }
  if (lastErr.includes("RESOURCE_EXHAUSTED")) throw new AiError("AI is busy (free-tier limit reached). Try again in a minute.");
  if (lastErr.includes("UNAVAILABLE") || lastErr.includes("high demand") || lastErr.includes("overloaded"))
    throw new AiError("Google's AI is overloaded right now. Please try again in a few minutes.");
  if (lastErr.includes("API_KEY_INVALID") || lastErr.includes("API key not valid"))
    throw new AiError("The Gemini API key is not valid. Check GEMINI_API_KEY in Vercel.");
  if (!lastErr) throw new AiError("The AI took too long. Try a shorter message, or split it into smaller parts.");
  throw new AiError(`AI request failed: ${lastErr.slice(0, 300)}`);
}

export function textOf(resp: any): string {
  return (resp?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
}

/** Ask for JSON matching an OpenAPI-style schema. */
export async function generateJSON<T>(system: string, parts: Part[], schema: Record<string, unknown>, temperature = 0.1, budgetMs = 50_000): Promise<T> {
  const resp = await generate({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature },
  }, budgetMs);
  const txt = textOf(resp);
  try {
    return JSON.parse(txt) as T;
  } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new AiError("AI returned an unreadable answer. Please try again.");
  }
}
