import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./session";

/** Wrap a route handler: converts thrown errors into JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response | unknown>) {
  return async (...args: A): Promise<Response> => {
    try {
      const out = await fn(...args);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : 500;
      let message = e?.message || "Something went wrong";
      if (String(message).includes("PERIOD_LOCKED")) message = "This month is locked. Ask the owner to unlock it in Settings.";
      if (status === 500) console.error(e);
      return NextResponse.json({ error: message }, { status: message.startsWith("This month is locked") ? 409 : status });
    }
  };
}

export function bad(msg: string): never {
  throw new HttpError(400, msg);
}
