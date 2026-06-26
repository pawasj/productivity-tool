"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { IndianRupee, Plus, Trash2, Loader2, Calendar, Save } from "lucide-react";
import type { Vertical, Profile } from "@/lib/types";

interface SalaryEntry {
  id: string;
  member_id?: string;
  member_name: string;
  member_type: "employee" | "intern" | "freelancer";
  department?: string;
  vertical_id?: string;
  vertical?: Vertical;
  amount: number;
  month: string;
  notes?: string;
  created_at: string;
}

interface Props { userId: string; verticals: Vertical[]; members: Profile[]; }

const MEMBER_TYPES = [
  { value: "employee", label: "Employee" },
  { value: "intern", label: "Intern" },
  { value: "freelancer", label: "Freelancer / Contractor" },
];

function fmt(n: number) { if (!n) return "₹0"; return `₹${n.toLocaleString("en-IN")}`; }

export default function SalaryClient({ userId, verticals, members }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [entries, setEntries] = useState<SalaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    member_id: "", member_name: "", member_type: "employee" as SalaryEntry["member_type"],
    department: "", vertical_id: "", amount: "", notes: "",
  });
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("salary_entries")
      .select("*, vertical:verticals(id,name,color)")
      .eq("month", month)
      .order("member_name");
    setEntries((data || []) as SalaryEntry[]);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // Auto-fill from member selection
  function selectMember(memberId: string) {
    const m = members.find(x => x.id === memberId);
    setForm(f => ({
      ...f,
      member_id: memberId,
      member_name: m?.full_name || "",
      department: m?.department || "",
      member_type: "employee",
    }));
  }

  async function addEntry() {
    if (!form.member_name.trim() || !form.amount) return;
    setSaving(true);
    const { data } = await supabase.from("salary_entries").insert({
      member_id: form.member_id || null,
      member_name: form.member_name.trim(),
      member_type: form.member_type,
      department: form.department || null,
      vertical_id: form.vertical_id || null,
      amount: parseFloat(form.amount),
      month,
      notes: form.notes || null,
      created_by: userId,
    }).select("*, vertical:verticals(id,name,color)").single();
    if (data) setEntries(prev => [...prev, data as SalaryEntry]);

    // Also sync to expenses table so P&L / Expense Report picks it up
    await supabase.from("expenses").upsert({
      category: "Salaries",
      description: `${form.member_name.trim()} (${form.member_type})`,
      amount: parseFloat(form.amount),
      month,
      vertical_id: form.vertical_id || null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "category,description,month" });

    setSaving(false);
    setShowForm(false);
    setForm({ member_id: "", member_name: "", member_type: "employee", department: "", vertical_id: "", amount: "", notes: "" });
  }

  async function remove(entry: SalaryEntry) {
    if (!confirm("Remove this salary entry?")) return;
    await supabase.from("salary_entries").delete().eq("id", entry.id);
    // Also remove synced expense
    await supabase.from("expenses").delete().eq("category", "Salaries").eq("description", `${entry.member_name} (${entry.member_type})`).eq("month", month);
    setEntries(prev => prev.filter(e => e.id !== entry.id));
  }

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const byType = MEMBER_TYPES.map(t => ({
    ...t,
    total: entries.filter(e => e.member_type === t.value).reduce((s, e) => s + e.amount, 0),
    count: entries.filter(e => e.member_type === t.value).length,
  }));
  const monthLabel = new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-sm">
              <IndianRupee className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Salary & Payouts</h1>
              <p className="text-sm text-slate-400">Recorded to Expense Report & P&L automatically</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> Add Entry
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            <p className="text-xs text-emerald-600 font-medium">Total Payout</p>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{fmt(total)}</p>
            <p className="text-xs text-emerald-400">{monthLabel}</p>
          </div>
          {byType.map(t => (
            <div key={t.value} className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium">{t.label}s</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5">{fmt(t.total)}</p>
              <p className="text-xs text-slate-400">{t.count} {t.count === 1 ? "person" : "people"}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <IndianRupee className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No salary entries for {monthLabel}</p>
            <p className="text-xs mt-1">Add entries — they sync to Expense Report & P&L automatically</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm">Salary Register — {monthLabel}</h3>
              <p className="text-sm font-bold text-emerald-700">{entries.length} entries · {fmt(total)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["Name", "Type", "Department", "Vertical", "Amount", "Notes", ""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50 group">
                      <td className="px-4 py-3 font-medium text-slate-900">{e.member_name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          e.member_type === "employee" ? "bg-blue-100 text-blue-700" :
                          e.member_type === "intern" ? "bg-violet-100 text-violet-700" :
                          "bg-amber-100 text-amber-700"}`}>
                          {e.member_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{e.department || "—"}</td>
                      <td className="px-4 py-3">
                        {e.vertical ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${e.vertical.color}20`, color: e.vertical.color }}>
                            {e.vertical.name}
                          </span>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">{fmt(e.amount)}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{e.notes || "—"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => remove(e)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-1 rounded transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-slate-500">Total Payroll</td>
                    <td className="px-4 py-3 font-bold text-emerald-700 text-lg">{fmt(total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Add Salary / Payout</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Select Team Member (or enter manually)</label>
                <select value={form.member_id} onChange={e => selectMember(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">— Type manually below —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name} {m.designation ? `(${m.designation})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
                <input value={form.member_name} onChange={e => setForm(f => ({ ...f, member_name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                  <select value={form.member_type} onChange={e => setForm(f => ({ ...f, member_type: e.target.value as SalaryEntry["member_type"] }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {MEMBER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount (₹) *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
                  <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    placeholder="e.g. Design"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Vertical</label>
                  <select value={form.vertical_id} onChange={e => setForm(f => ({ ...f, vertical_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">General</option>
                    {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. includes performance bonus"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={addEntry} disabled={saving || !form.member_name || !form.amount}
                className="flex-1 py-2.5 text-sm bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Saving…" : "Save Entry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
