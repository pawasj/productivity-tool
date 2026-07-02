"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  value: string;            // "YYYY-MM"
  onChange: (month: string) => void;
  accent?: string;          // tailwind focus ring color class, e.g. "focus:ring-emerald-500"
}

function shift(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MonthPicker({ value, onChange, accent = "focus:ring-indigo-500" }: Props) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(shift(value, -1))}
        title="Previous month"
        className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <input
        type="month"
        value={value}
        onChange={e => e.target.value && onChange(e.target.value)}
        className={`px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 ${accent}`}
      />
      <button
        type="button"
        onClick={() => onChange(shift(value, 1))}
        title="Next month"
        className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
