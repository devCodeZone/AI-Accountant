import { LoginForm } from "./form";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">₹</div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Accountant</h1>
        <p className="mt-1 text-sm text-muted">Speak, type or snap a bill — your books stay up to date.</p>
      </div>
      {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <LoginForm demo={process.env.ENABLE_DEMO === "true"} />
    </main>
  );
}
