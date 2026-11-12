import { Input } from "./ui";

export function RangeFilter({ from, to, extra }: { from?: string; to?: string; extra?: React.ReactNode }) {
  return (
    <form className="no-print flex flex-wrap items-end gap-2 text-sm">
      <Input type="date" name="from" defaultValue={from} className="w-auto" aria-label="From" />
      <Input type="date" name="to" defaultValue={to} className="w-auto" aria-label="To" />
      {extra}
      <button className="h-10 rounded-xl bg-ink px-4 text-white">Show</button>
    </form>
  );
}
