"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { BarChart3, Calendar, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Vertical } from "@/lib/types";

interface Props { verticals: Vertical[]; }
function fmt(n: number) { if (!n) return "₹0"; if (n >= 1e7) return `₹${(n/1e7).toFixed(1)}Cr`; if (n >= 1e5) return `₹${(n/1e5).toFixed(1)}L`; return `₹${Math.abs(n).toLocaleString("en-IN")}`; }

export default function PnLReport({ verticals }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [loading, setLoading] = useState(false);
  const [revenue, setRevenue] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [vData, setVData] = useState<Map<string, { name: string; color: string; revenue: number; expense: number }>>(new Map());

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: leads }, { data: exps }] = await Promise.all([
      supabase.from("leads").select("deal_value, monthly_value, engagement_type, vertical_id, deal_month, approved_at, updated_at, vertical:verticals(name,color)").eq("status", "approved"),
      supabase.from("expenses").select("amount, vertical_id, vertical:verticals(name,color)").eq("month", month),
    ]);

    let totalRev = 0;
    let totalExp = 0;
    const vMap = new Map<string, { name: string; color: string; revenue: number; expense: number }>();

    function lMonth(l: Record<string, unknown>) {
      if (l.deal_month) return String(l.deal_month).slice(0, 7);
      if (l.approved_at) return String(l.approved_at).slice(0, 7);
      return String(l.updated_at || "").slice(0, 7);
    }
    for (const l of (leads || []) as Record<string, unknown>[]) {
      if (lMonth(l) !== month) continue;
      const val = l.engagement_type === "retainer" ? Number(l.monthly_value || 0) : Number(l.deal_value || 0);
      totalRev += val;
      const vId = String(l.vertical_id || "unassigned");
      const vName = (l.vertical as {name:string;color:string} | null)?.name || "Unassigned";
      const vColor = (l.vertical as {name:string;color:string} | null)?.color || "#94a3b8";
      const ex = vMap.get(vId);
      if (ex) ex.revenue += val; else vMap.set(vId, { name: vName, color: vColor, revenue: val, expense: 0 });
    }
    for (const e of (exps || []) as Record<string, unknown>[]) {
      const amt = Number(e.amount || 0);
      totalExp += amt;
      const vId = String(e.vertical_id || "unassigned");
      const vName = (e.vertical as {name:string;color:string} | null)?.name || "Unassigned";
      const vColor = (e.vertical as {name:string;color:string} | null)?.color || "#94a3b8";
      const ex = vMap.get(vId);
      if (ex) ex.expense += amt; else vMap.set(vId, { name: vName, color: vColor, revenue: 0, expense: amt });
    }

    setRevenue(totalRev); setExpenses(totalExp); setVData(vMap);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const gross = revenue - expenses;
  const margin = revenue > 0 ? Math.round((gross / revenue) * 100) : 0;
  const vRows = [...vData.values()].sort((a, b) => (b.revenue - b.expense) - (a.revenue - a.expense));
  const monthLabel = new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-slate-400" />
          <label className="text-sm font-medium text-slate-700">Report Month:</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div> : (
        <>
          {/* P&L Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-700">
              <h3 className="text-white font-bold text-lg">Profit & Loss — {monthLabel}</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-6 mb-6">
                <div className="text-center p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Total Revenue</p>
                  <p className="text-3xl font-bold text-emerald-700 mt-2">{fmt(revenue)}</p>
                </div>
                <div className="text-center p-5 bg-rose-50 rounded-2xl border border-rose-100">
                  <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide">Total Expenses</p>
                  <p className="text-3xl font-bold text-rose-700 mt-2">{fmt(expenses)}</p>
                </div>
                <div className={`text-center p-5 rounded-2xl border ${gross >= 0 ? "bg-blue-50 border-blue-100" : "bg-red-50 border-red-100"}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${gross >= 0 ? "text-blue-600" : "text-red-600"}`}>Net Profit / Loss</p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    {gross > 0 ? <TrendingUp className="w-5 h-5 text-blue-600" /> : gross < 0 ? <TrendingDown className="w-5 h-5 text-red-600" /> : <Minus className="w-5 h-5 text-slate-400" />}
                    <p className={`text-3xl font-bold ${gross >= 0 ? "text-blue-700" : "text-red-700"}`}>
                      {gross < 0 ? "-" : ""}{fmt(gross)}
                    </p>
                  </div>
                  <p className={`text-sm mt-1 font-medium ${gross >= 0 ? "text-blue-600" : "text-red-600"}`}>{margin}% margin</p>
                </div>
              </div>

              {/* Visual bar */}
              {revenue > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Cost Ratio</span><span>{100 - margin}% costs of revenue</span>
                  </div>
                  <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${margin}%` }} />
                    <div className="h-full bg-rose-400 transition-all" style={{ width: `${Math.min(100 - margin, 100)}%` }} />
                  </div>
                  <div className="flex gap-4 mt-1">
                    <span className="text-xs text-emerald-600">■ Profit {margin}%</span>
                    <span className="text-xs text-rose-500">■ Expense {100 - margin}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Vertical P&L */}
          {vRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Vertical-wise P&L</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Vertical", "Revenue", "Expenses", "Profit / Loss", "Margin"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {vRows.map(v => {
                    const profit = v.revenue - v.expense;
                    const vMargin = v.revenue > 0 ? Math.round((profit / v.revenue) * 100) : 0;
                    return (
                      <tr key={v.name} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${v.color}20`, color: v.color }}>{v.name}</span>
                        </td>
                        <td className="px-5 py-3 text-emerald-700 font-semibold">{fmt(v.revenue)}</td>
                        <td className="px-5 py-3 text-rose-600 font-semibold">{fmt(v.expense)}</td>
                        <td className="px-5 py-3">
                          <span className={`font-bold ${profit >= 0 ? "text-blue-700" : "text-red-600"}`}>
                            {profit < 0 ? "-" : "+"}{fmt(profit)}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, vMargin))}%`, background: profit >= 0 ? "#3b82f6" : "#ef4444" }} />
                            </div>
                            <span className={`text-xs font-medium ${profit >= 0 ? "text-blue-600" : "text-red-500"}`}>{vMargin}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                    <td className="px-5 py-3 text-slate-700">Total</td>
                    <td className="px-5 py-3 text-emerald-700">{fmt(revenue)}</td>
                    <td className="px-5 py-3 text-rose-600">{fmt(expenses)}</td>
                    <td className="px-5 py-3"><span className={gross >= 0 ? "text-blue-700" : "text-red-600"}>{gross >= 0 ? "+" : "-"}{fmt(gross)}</span></td>
                    <td className="px-5 py-3 text-slate-700">{margin}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
