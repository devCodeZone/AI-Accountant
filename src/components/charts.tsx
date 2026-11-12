"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmt = (v: number) => {
  const n = Math.abs(v), s = v < 0 ? "-" : "";
  if (n >= 1e7) return `${s}₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${s}₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${s}₹${Math.round(n / 1e3)}k`;
  return `${s}₹${Math.round(n)}`;
};
const full = (v: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v));
const C = { income: "#15803d", expense: "#dc2626", brand: "#0f766e", amber: "#d97706", grey: "#a8a29e" };
const axis = { fontSize: 11, fill: "#78716c" };

export function IncomeExpenseChart({ data }: { data: { label: string; income: number; expense: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: -10, right: 4, top: 4 }}>
        <CartesianGrid vertical={false} stroke="#eee" />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={axis} tickFormatter={fmt} tickLine={false} axisLine={false} width={56} />
        <Tooltip formatter={full} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="income" name="Income" fill={C.income} radius={[3, 3, 0, 0]} />
        <Bar isAnimationActive={false} dataKey="expense" name="Expense" fill={C.expense} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, color = "#57534e", height }: { data: { name: string; value: number; color?: string }[]; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 30 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tick={axis} width={130} tickLine={false} axisLine={false} />
        <Tooltip formatter={full} />
        <Bar isAnimationActive={false} dataKey="value" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.color ?? color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashflowChart({ data, color = "#0f766e" }: { data: { label: string; closing: number; inflow: number; outflow: number }[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: -10, right: 8, top: 4 }}>
        <CartesianGrid vertical={false} stroke="#eee" />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={axis} tickFormatter={fmt} tickLine={false} axisLine={false} width={56} />
        <Tooltip formatter={full} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line isAnimationActive={false} dataKey="closing" name="Cash + bank" stroke={color} strokeWidth={2} dot={false} />
        <Line isAnimationActive={false} dataKey="inflow" name="Money in" stroke={C.income} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
        <Line isAnimationActive={false} dataKey="outflow" name="Money out" stroke={C.expense} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export const HEALTH = { green: "#15803d", amber: "#d97706", red: "#dc2626" };
