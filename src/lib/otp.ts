import "server-only";
import { sbAuth } from "./supabase";

/** Optional fixed OTPs for testing without an SMS provider: DEV_OTP_PHONES="9876543210:123456,9999999999:111111" */
function devCode(phone: string): string | null {
  const list = (process.env.DEV_OTP_PHONES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const item of list) {
    const [p, code] = item.split(":");
    if (p && code && phone.endsWith(p.replace(/\D/g, "").slice(-10))) return code;
  }
  return null;
}

export async function sendOtp(phone: string) {
  if (devCode(phone)) return { ok: true, dev: true };
  const { error } = await sbAuth().auth.signInWithOtp({ phone });
  if (error) throw new Error(error.message.includes("provider") || error.message.includes("Unsupported")
    ? "SMS login isn't configured yet. Turn on Phone auth in Supabase (MSG91/Twilio) or set DEV_OTP_PHONES."
    : error.message);
  return { ok: true };
}

export async function verifyOtp(phone: string, token: string): Promise<boolean> {
  const dev = devCode(phone);
  if (dev) return dev === token;
  const { data, error } = await sbAuth().auth.verifyOtp({ phone, token, type: "sms" });
  return !error && !!data?.user;
}
