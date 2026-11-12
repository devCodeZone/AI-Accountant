import "server-only";

// Thin Gemini REST client (no SDK needed). Model is configurable; "gemini-flash-latest"
// always points to Google's current Flash model and works on the free tier.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const model = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
export type Content = { role: "user" | "model"; parts: Part[] };

export class AiError extends Error {}

export async function generate(body: Record<string, unknown>): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError("GEMINI_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.");
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}/${model()}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    lastErr = await res.text();
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1200 * (attempt + 1))); continue; }
    break;
  }
  if (lastErr.includes("RESOURCE_EXHAUSTED")) throw new AiError("AI is busy (free-tier limit reached). Try again in a minute.");
  throw new AiError(`AI request failed: ${lastErr.slice(0, 300)}`);
}

export function textOf(resp: any): string {
  return (resp?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
}

/** Ask for JSON matching an OpenAPI-style schema. */
export async function generateJSON<T>(system: string, parts: Part[], schema: Record<string, unknown>, temperature = 0.1): Promise<T> {
  const resp = await generate({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature },
  });
  const txt = textOf(resp);
  try {
    return JSON.parse(txt) as T;
  } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new AiError("AI returned an unreadable answer. Please try again.");
  }
}
