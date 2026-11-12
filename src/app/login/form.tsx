"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";

export function LoginForm({ demo }: { demo: boolean }) {
  const r = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function post(url: string, body: object) {
    setBusy(true); setErr("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      return j;
    } catch (e: any) { setErr(e.message); return null; } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {step === "phone" ? (
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await post("/api/auth/otp/send", { phone })) setStep("code"); }}>
          <Field label="Mobile number">
            <div className="flex gap-2">
              <span className="flex h-10 items-center rounded-xl border border-line bg-stone-50 px-3 text-sm">+91</span>
              <Input inputMode="numeric" autoComplete="tel-national" placeholder="98XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          </Field>
          <Button className="w-full" size="lg" disabled={busy}>{busy ? "Sending…" : "Send OTP"}</Button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const j = await post("/api/auth/otp/verify", { phone, code }); if (j) r.replace(j.next); }}>
          <Field label={`OTP sent to +91 ${phone}`}>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </Field>
          <Button className="w-full" size="lg" disabled={busy}>{busy ? "Checking…" : "Verify & continue"}</Button>
          <button type="button" className="w-full text-sm text-muted" onClick={() => setStep("phone")}>Change number</button>
        </form>
      )}
      {err && <p className="text-sm text-bad">{err}</p>}
      {demo && (
        <form action="/api/auth/demo" method="post" className="border-t border-line pt-4">
          <Button variant="secondary" className="w-full">Try the demo company</Button>
          <p className="mt-2 text-center text-xs text-muted">Sample projects, vendors and entries — no login needed.</p>
        </form>
      )}
    </div>
  );
}
