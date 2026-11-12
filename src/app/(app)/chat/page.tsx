import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ChatClient } from "./client";

export default async function Chat() {
  const s = await requireCompany();
  if (!can.viewFinancials(s.role)) redirect("/transactions");
  return <ChatClient />;
}
