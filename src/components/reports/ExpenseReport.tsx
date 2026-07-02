"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Plus, Trash2, Loader2, Calendar, Receipt } from "lucide-react";
import MonthPicker from "@/components/ui/MonthPicker";
import type { Vertical, Expense } from "@/lib/types";

const CATEGORIES = ["Salaries", "Tools & Software", "Office Rent", "Marketing", "Travel", "Freelancers", "Content Production", "Miscellaneous"];

interface Props { verticals: Vertical[]; userId: string; }

function fmt(n?: number) { if (!n) return "₹0"; return `₹${n.toLocaleString("en-IN")}`; }

export default function ExpenseReport({ verticals, userId }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: CATEGORIES[0], description: "", amount: "", vertical_id: "" });
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    // Service-role API so RLS never hides expenses created by other users
    const res = await fetch(`/api/reports/summary?month=${month}`);
    const json = await res.json();
    setExpenses((json.expenses || []) as Expense[]);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // Refresh when the user returns to this tab
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function addExpense() {
    if (!form.amount || !form.category) return;
    setSaving(true);
    await supabase.from("expenses").insert({
      category: form.category,
      description: form.description || null,
      amount: parseFloat(form.amount),
      month,
      vertical_id: form.vertical_id || null,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    setForm({ category: CATEGORIES[0], description: "", amount: "", vertical_id: "" });
    setShowAdd(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) { alert(`Failed to delete: ${error.message}`); return; }
    setExpenses(e => e.filter(x => x.id !== id));
  }

  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  // Category breakdown
  const catMap = new Map<string, number>();
  for (const e of expenses) { catMap.set(e.category, (catMap.get(e.category) || 0) + e.amount); }
  const catBreakdown = [...catMap.entries()].sort((a, b) => b[1] - a[1]);

  // Vertical breakdown
  const vMap = new Map<string, { name: string; color: string; amount: number }>();
  for (const e of expenses) {
    const vId = e.vertical_id || "unassigned";
    const vName = (e as Expense & { vertical?: { name: string; color: string } }).vertical?.name || "Unassigned";
    const vColor = (e as Expense & { vertical?: { name: string; color: string } }).vertical?.color || "#94a3b8";
    const ex = vMap.get(vId);
    if (ex) ex.amount += e.amount; else vMap.set(vId, { name: vName, color: vColor, amount: e.amount });
  }
  const vBreakdown = [...vMap.values()].sort((a, b) => b.amount - a.amount);
  const maxV = Math.max(...vBreakdown.map(v => v.amount), 1);

  const monthLabel = new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-slate-400" />
            <label className="text-sm font-medium text-slate-700">Month:</label>
            <MonthPicker value={month} onChange={setMonth} accent="focus:ring-rose-500" />
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-medium hover:bg-rose-700">
            <Plus className="w-4 h-4" /> Add Expense
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-rose-400" /></div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 col-span-1">
              <div className="w-8 h-8 bg-rose-600 rounded-lg mb-3" />
              <p className="text-xs text-slate-500">Total Expenses</p>
              <p className="text-2xl font-bold text-rose-700 mt-1">{fmt(total)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{monthLabel}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 mb-3 font-semibold uppercase tracking-wide">By Category</p>
              <div className="space-y-2">
                {catBreakdown.slice(0, 5).map(([cat, amt]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 truncate">{cat}</span>
                    <span className="text-xs font-bold text-slate-800 ml-2">{fmt(amt)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 mb-3 font-semibold uppercase tracking-wide">By Vertical</p>
              <div className="space-y-2">
                {vBreakdown.map(v => (
                  <div key={v.name}>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-xs text-slate-600">{v.name}</span>
                      <span className="text-xs font-bold text-slate-800">{fmt(v.amount)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(v.amount / maxV) * 100}%`, background: v.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Expense Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Expenses — {monthLabel}</h3>
              <p className="text-sm text-rose-700 font-bold">{expenses.length} entries · {fmt(total)}</p>
            </div>
            {expenses.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No expenses recorded for {monthLabel}</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Category", "Description", "Vertical", "Amount"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {expenses.map(e => {
                    const ev = e as Expense & { vertical?: { name: string; color: string } };
                    return (
                      <tr key={e.id} className="hover:bg-slate-50 group">
                        <td className="px-4 py-3"><span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium">{e.category}</span></td>
                        <td className="px-4 py-3 text-slate-600">{e.description || "—"}</td>
                        <td className="px-4 py-3">
                          {ev.vertical ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${ev.vertical.color}20`, color: ev.vertical.color }}>{ev.vertical.name}</span> : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">{fmt(e.amount)}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => remove(e.id)} className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 p-1 transition-opacity">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-slate-500">Total</td>
                    <td className="px-4 py-3 font-bold text-rose-700 text-lg">{fmt(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {/* Add Expense Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Add Expense</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Adobe Creative Suite subscription"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount (₹)</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Vertical</label>
                  <select value={form.vertical_id} onChange={e => setForm(f => ({ ...f, vertical_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
                    <option value="">General</option>
                    {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={addExpense} disabled={saving || !form.amount}
                className="flex-1 py-2.5 text-sm bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? "Adding…" : "Add Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
