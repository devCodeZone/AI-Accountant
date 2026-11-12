import { randomUUID } from "crypto";
import { handle, bad } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { sb, BUCKET, ensureBucket, signedUrl } from "@/lib/supabase";

const OK = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export const POST = handle(async (req: Request) => {
  const s = await apiSession();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) bad("No file");
  if (!OK.includes(file.type)) bad("Upload a photo (JPG/PNG) or PDF");
  if (file.size > 4 * 1024 * 1024) bad("File is larger than 4 MB");
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${s.company_id}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  await ensureBucket();
  const { error } = await sb().storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (error) throw error;
  return { path, url: await signedUrl(path) };
});
