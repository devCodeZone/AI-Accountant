import { requireCompany } from "@/lib/session";
import { getRefs } from "@/lib/refs";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AddClient } from "./client";

export default async function AddPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requireCompany();
  if (!can.addEntries(s.role)) redirect("/dashboard");
  const refs = await getRefs(s.company_id);
  const { tab } = await searchParams;
  return <AddClient refs={refs} initialTab={(tab as any) ?? "speak"} />;
}
