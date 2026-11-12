"use client";
import { useRouter } from "next/navigation";
import { CompanyForm } from "@/components/company-form";

export function Wizard() {
  const r = useRouter();
  return (
    <CompanyForm wizard initial={{ brand_color: "#0f766e", fy_start_month: 4 }} submitLabel="Create company"
      onSubmit={async (v) => {
        const res = await fetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
        const j = await res.json();
        if (!res.ok) return j.error;
        r.replace(j.next);
      }} />
  );
}
