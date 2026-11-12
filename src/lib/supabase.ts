import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

/** Service-role client. Server only. Every query MUST filter by company_id (see lib/db.ts). */
export function sb(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** Anon client — used only to drive Supabase phone OTP from the server. */
export function sbAuth(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const BUCKET = "receipts";

export async function ensureBucket() {
  const { data } = await sb().storage.getBucket(BUCKET);
  if (!data) await sb().storage.createBucket(BUCKET, { public: false });
}

export async function signedUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data } = await sb().storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/** Fetch every row (Supabase caps a single select at 1000). */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let i = 0; i < 100; i++) {
    const { data, error } = await build(i * page, i * page + page - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}
