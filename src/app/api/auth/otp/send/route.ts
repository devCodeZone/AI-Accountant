import { handle, bad } from "@/lib/api";
import { normalizePhone } from "@/lib/format";
import { sendOtp } from "@/lib/otp";

export const POST = handle(async (req: Request) => {
  const { phone } = await req.json();
  const p = normalizePhone(phone);
  if (!p) bad("Enter a valid 10-digit mobile number");
  return sendOtp(p);
});
