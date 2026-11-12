import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Wizard } from "./wizard";

export default async function Onboarding() {
  const s = await getSession();
  if (!s) redirect("/login");
  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your company</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Takes 2 minutes. Your name, logo and colours appear on every screen, invoice and report.</p>
      <Wizard />
    </main>
  );
}
