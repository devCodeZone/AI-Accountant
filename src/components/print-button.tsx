"use client";
import { Button } from "./ui";
export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return <Button variant="secondary" className="no-print" onClick={() => window.print()}>{label}</Button>;
}
