"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  IndianRupee, Loader2, Calendar, Pencil, Check, X,
  ChevronDown, ChevronRight, Plus, BarChart3, ListChecks, Trash2,
} from "lucide-react";
import type { Vertical, Profile } from "@/lib/types";
import MonthPicker from "@/components/ui/MonthPicker";

interface SalaryEntry {
  id: string;
  member_id?: string;
  member_name: string;
  member_type: "employee" | "intern" | "freelancer";
  department?: string;
  vertical_id?: string;
  amount: number;
  month: string;
  notes?: string;
}

interface VendorRow { id: string; name: string; type: string; service_type?: string; rate?: number }

interface Props {
  userId: string;
  verticals: Vertical[];
  members: Profile[];
  vendors: VendorRow[];
}

interface RosterPerson {
  key: string;
  source_id: string;
  name: string;
  role: string;
  department?: string;
  category: "employee" | "intern" | "freelancer";
  default_rate?: number;
  isAdHoc?: boolean;      // true = added directly via "Add Payout", not from profiles/vendors
  entryId?: string;       // for ad-hoc: the salary_entry id itself
}

const EMPTY_ADD = { name: "", type: "employee" as "employee" | "intern" | "freelancer", role: "", amount: "", vertical_id: "", notes: "" };

const supabase = createClient();

function fmt(n: number) { return n ? `₹${n.toLocaleString("en-IN")}` : "—"; }
function monthLabel(ym: string) {
  return new Date(ym + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

const CAT_STYLES: Record<string, string> = {
  employee: "bg-blue-100 text-blue-700",
  intern: "bg-violet-100 text-violet-700",
  freelancer: "bg-amber-100 text-amber-700",
};
const CAT_LABELS: Record<string, string> = {
  employee: "Employee",
  intern: "Intern",
  freelancer: "Vendor / Freelancer",
};

export default function SalaryClient({ userId, verticals, members: initialMembers, vendors: initialVendors }: Props) {
  const now = new Date();
  const [tab, setTab] = useState<"payroll" | "history">("payroll");
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [entries, setEntries] = useState<SalaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Profile[]>(initialMembers);
  const [vendors, setVendors] = useState<VendorRow[]>(initialVendors);
  const [editing, setEditing] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editVerticalId, setEditVerticalId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Add Payout modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ...EMPTY_ADD });
  const [addSaving, setAddSaving] = useState(false);

  // History
  const [history, setHistory] = useState<SalaryEntry[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // Re-fetch members/vendors client-side to ensure data always populates
  useEffect(() => {
    async function fetchRoster() {
      if (initialMembers.length === 0) {
        const { data } = await supabase.from("profiles").select("*").order("full_name");
        if (data?.length) setMembers(data as Profile[]);
      }
      if (initialVendors.length === 0) {
        const { data } = await supabase.from("vendors").select("id, name, type, service_type, rate").order("name");
        if (data?.length) setVendors(data as VendorRow[]);
      }
    }
    fetchRoster();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build roster from profiles + vendors
  const rosterPeople: RosterPerson[] = [
    ...members.map(m => ({
      key: `emp-${m.id}`,
      source_id: m.id,
      name: m.full_name || "Unknown",
      role: m.designation || (m.role === "admin" ? "Admin" : "Employee"),
      department: m.department,
      category: "employee" as const,
    })),
    ...vendors.filter(v => v.type === "intern").map(v => ({
      key: `intern-${v.id}`,
      source_id: v.id,
      name: v.name,
      role: v.service_type || "Intern",
      category: "intern" as const,
      default_rate: v.rate,
    })),
    ...vendors.filter(v => v.type === "vendor").map(v => ({
      key: `vendor-${v.id}`,
      source_id: v.id,
      name: v.name,
      role: v.service_type || "Vendor / Freelancer",
      category: "freelancer" as const,
      default_rate: v.rate,
    })),
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("salary_entries").select("*").eq("month", month).order("member_name");
      setEntries((data || []) as SalaryEntry[]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // History: last 12 months of salary_entries
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    const months: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const { data } = await supabase.from("salary_entries").select("*").in("month", months).order("month", { ascending: false });
    setHistory((data || []) as SalaryEntry[]);
    setHistLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);

  // Ad-hoc entries: entries in `entries` for this month that don't match any roster person
  const rosterSourceIds = new Set(rosterPeople.map(p => p.source_id));
  const rosterNames = new Set(rosterPeople.map(p => p.name));
  const adHocEntries = entries.filter(e =>
    (!e.member_id || !rosterSourceIds.has(e.member_id)) && !rosterNames.has(e.member_name)
  );

  // Build full roster including ad-hoc entries as virtual people
  const adHocPeople: RosterPerson[] = adHocEntries.map(e => ({
    key: `adhoc-${e.id}`,
    source_id: e.id,
    name: e.member_name,
    role: CAT_LABELS[e.member_type] || e.member_type,
    category: e.member_type,
    isAdHoc: true,
    entryId: e.id,
  }));

  const roster: RosterPerson[] = [...rosterPeople, ...adHocPeople];

  function entryFor(person: RosterPerson): SalaryEntry | undefined {
    if (person.isAdHoc) return entries.find(e => e.id === person.entryId);
    return entries.find(e => e.member_id === person.source_id || e.member_name === person.name);
  }

  function startEdit(person: RosterPerson) {
    const entry = entryFor(person);
    setEditing(person.key);
    setEditAmount(entry ? String(entry.amount) : person.default_rate ? String(person.default_rate) : "");
    setEditVerticalId(entry?.vertical_id || "");
    setEditNotes(entry?.notes || "");
  }

  function cancelEdit() { setEditing(null); setEditAmount(""); setEditVerticalId(""); setEditNotes(""); }

  async function saveEntry(person: RosterPerson) {
    if (!editAmount) return;
    setSaving(true);
    const amount = parseFloat(editAmount);
    const existing = entryFor(person);
    const payload = {
      member_id: person.isAdHoc ? null : person.source_id,
      member_name: person.name,
      member_type: person.category,
      department: person.department || null,
      vertical_id: editVerticalId || null,
      amount, month,
      notes: editNotes || null,
      created_by: userId,
    };
    let saved: SalaryEntry | null = null;
    if (existing) {
      const { data } = await supabase.from("salary_entries").update(payload).eq("id", existing.id).select().single();
      saved = data as SalaryEntry | null;
      if (saved) setEntries(prev => prev.map(e => e.id === existing.id ? saved! : e));
    } else {
      const { data } = await supabase.from("salary_entries").insert(payload).select().single();
      saved = data as SalaryEntry | null;
      if (saved) setEntries(prev => [...prev, saved!]);
    }
    await supabase.from("expenses").upsert({
      category: "Salaries",
      description: `${person.name} (${person.category})`,
      amount, month,
      vertical_id: editVerticalId || null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "category,description,month" });
    setSaving(false);
    cancelEdit();
  }

  async function clearEntry(person: RosterPerson) {
    const existing = entryFor(person);
    if (!existing) return;
    if (!confirm(`Remove ${person.name}'s payout for ${monthLabel(month)}?`)) return;
    await supabase.from("salary_entries").delete().eq("id", existing.id);
    await supabase.from("expenses").delete()
      .eq("category", "Salaries")
      .eq("description", `${person.name} (${person.category})`)
      .eq("month", month);
    setEntries(prev => prev.filter(e => e.id !== existing.id));
  }

  // Add payout (ad-hoc)
  async function submitAdd() {
    if (!addForm.name.trim() || !addForm.amount) return;
    setAddSaving(true);
    const amount = parseFloat(addForm.amount);
    const payload = {
      member_id: null,
      member_name: addForm.name.trim(),
      member_type: addForm.type,
      department: null,
      vertical_id: addForm.vertical_id || null,
      amount, month,
      notes: addForm.notes || null,
      created_by: userId,
    };
    const { data } = await supabase.from("salary_entries").insert(payload).select().single();
    if (data) {
      setEntries(prev => [...prev, data as SalaryEntry]);
      await supabase.from("expenses").upsert({
        category: "Salaries",
        description: `${addForm.name.trim()} (${addForm.type})`,
        amount, month,
        vertical_id: addForm.vertical_id || null,
        created_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "category,description,month" });
    }
    setAddSaving(false);
    setShowAdd(false);
    setAddForm({ ...EMPTY_ADD });
  }

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const sectionTotals = (cat: string) => entries.filter(e => e.member_type === cat).reduce((s, e) => s + e.amount, 0);
  const sectionSet = (cat: string) => entries.filter(e => e.member_type === cat).length;

  const SECTIONS = [
    { key: "employee", label: "Employees", icon: "👤", people: roster.filter(r => r.category === "employee") },
    { key: "intern", label: "Interns", icon: "🎓", people: roster.filter(r => r.category === "intern") },
    { key: "freelancer", label: "Vendors & Freelancers", icon: "🤝", people: roster.filter(r => r.category === "freelancer") },
  ].filter(s => s.people.length > 0);

  // History table data
  const historyMonths = Array.from(new Set(history.map(e => e.month))).sort().reverse();
  const histCats = ["employee", "intern", "freelancer"] as const;

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
              <p className="text-sm text-slate-400">Roster auto-fetched · syncs to Expense Report & P&L</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {tab === "payroll" && (
              <>
                <Calendar className="w-4 h-4 text-slate-400" />
                <MonthPicker value={month} onChange={setMonth} accent="focus:ring-emerald-500" />
                <button onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-sm">
                  <Plus className="w-4 h-4" /> Add Payout
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-4">
          <button onClick={() => setTab("payroll")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "payroll" ? "bg-white shadow text-emerald-700" : "text-slate-500 hover:text-slate-700"}`}>
            <ListChecks className="w-3.5 h-3.5" /> Monthly Payroll
          </button>
          <button onClick={() => setTab("history")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "history" ? "bg-white shadow text-emerald-700" : "text-slate-500 hover:text-slate-700"}`}>
            <BarChart3 className="w-3.5 h-3.5" /> Month-on-Month
          </button>
        </div>

        {/* Summary cards — payroll tab only */}
        {tab === "payroll" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
              <p className="text-xs text-emerald-600 font-medium">Total Payroll</p>
              <p className="text-xl font-bold text-emerald-700 mt-0.5">{fmt(total)}</p>
              <p className="text-xs text-emerald-400">{monthLabel(month)}</p>
            </div>
            {(["employee","intern","freelancer"] as const).map(cat => (
              <div key={cat} className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-xs text-slate-500 font-medium capitalize">{cat === "freelancer" ? "Vendors/Freelancers" : cat + "s"}</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5">{fmt(sectionTotals(cat))}</p>
                <p className="text-xs text-slate-400">{sectionSet(cat)} entries</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PAYROLL TAB */}
      {tab === "payroll" && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
          ) : SECTIONS.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <IndianRupee className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium mb-1">No roster members yet</p>
              <p className="text-xs">Add team members in the Admin panel, or use the &quot;Add Payout&quot; button above.</p>
            </div>
          ) : (
            SECTIONS.map(section => (
              <div key={section.key} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setCollapsed(c => ({ ...c, [section.key]: !c[section.key] }))}
                  className="w-full flex items-center justify-between px-5 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{section.icon}</span>
                    <span className="font-semibold text-slate-900 text-sm">{section.label}</span>
                    <span className="text-xs text-slate-400">({section.people.length})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {sectionTotals(section.key) > 0 && (
                      <span className="text-sm font-bold text-emerald-700">{fmt(sectionTotals(section.key))}</span>
                    )}
                    {collapsed[section.key] ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {!collapsed[section.key] && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase">Name</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Role / Dept</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Vertical</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Notes</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                          <th className="w-28" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {section.people.map(person => {
                          const entry = entryFor(person);
                          const isEditing = editing === person.key;
                          const entryVertical = entry?.vertical_id ? verticals.find(v => v.id === entry.vertical_id) : null;

                          if (isEditing) {
                            return (
                              <tr key={person.key} className="bg-emerald-50/60">
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                                      {person.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="font-medium text-slate-900">{person.name}</span>
                                    {person.isAdHoc && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">manual</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500">
                                  {person.role}{person.department ? ` · ${person.department}` : ""}
                                </td>
                                <td className="px-4 py-3">
                                  <select value={editVerticalId} onChange={e => setEditVerticalId(e.target.value)}
                                    className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none text-slate-600 w-full">
                                    <option value="">General</option>
                                    {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                  </select>
                                </td>
                                <td className="px-4 py-3">
                                  <input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                                    placeholder="Notes (optional)"
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none text-slate-600" />
                                </td>
                                <td className="px-4 py-3">
                                  <div className="relative">
                                    <span className="absolute left-2.5 top-2 text-xs text-slate-400 font-medium">₹</span>
                                    <input autoFocus type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                                      placeholder="Amount"
                                      className="w-28 pl-6 pr-2 py-1.5 border border-emerald-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium" />
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-1 justify-end">
                                    <button onClick={() => saveEntry(person)} disabled={saving || !editAmount}
                                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
                                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                                    </button>
                                    <button onClick={cancelEdit} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={person.key} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                                    {person.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-medium text-slate-900">{person.name}</span>
                                  {person.isAdHoc && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">manual</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500">
                                {person.role}{person.department ? ` · ${person.department}` : ""}
                              </td>
                              <td className="px-4 py-3">
                                {entryVertical ? (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${entryVertical.color}20`, color: entryVertical.color }}>
                                    {entryVertical.name}
                                  </span>
                                ) : entry ? (
                                  <span className="text-xs text-slate-400">General</span>
                                ) : (
                                  <span className="text-xs text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 max-w-[220px]">
                                {entry?.notes || <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {entry ? (
                                  <span className="font-bold text-slate-900">{fmt(entry.amount)}</span>
                                ) : (
                                  <span className="text-xs text-slate-300 italic">Not set</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1 justify-end">
                                  <button onClick={() => startEdit(person)}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 hover:border-slate-300 transition-colors">
                                    <Pencil className="w-3 h-3" />
                                    {entry ? "Edit" : "Set"}
                                  </button>
                                  {entry && (
                                    <button onClick={() => clearEntry(person)}
                                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {histLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
          ) : historyMonths.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-sm">No historical data yet.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Month</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-blue-600">Employees</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-violet-600">Interns</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-amber-600">Vendors</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-emerald-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {historyMonths.map(ym => {
                    const rows = history.filter(e => e.month === ym);
                    const totals = {
                      employee: rows.filter(e => e.member_type === "employee").reduce((s, e) => s + e.amount, 0),
                      intern: rows.filter(e => e.member_type === "intern").reduce((s, e) => s + e.amount, 0),
                      freelancer: rows.filter(e => e.member_type === "freelancer").reduce((s, e) => s + e.amount, 0),
                    };
                    const rowTotal = totals.employee + totals.intern + totals.freelancer;
                    return (
                      <tr key={ym} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3 font-medium text-slate-800">{monthLabel(ym)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{totals.employee ? fmt(totals.employee) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{totals.intern ? fmt(totals.intern) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{totals.freelancer ? fmt(totals.freelancer) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-700">{fmt(rowTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-50 border-t-2 border-emerald-100">
                    <td className="px-5 py-3 text-xs font-bold text-emerald-700 uppercase tracking-wide">12-Month Total</td>
                    {histCats.map(cat => (
                      <td key={cat} className="px-4 py-3 text-right font-bold text-emerald-700 text-sm">
                        {fmt(history.filter(e => e.member_type === cat).reduce((s, e) => s + e.amount, 0))}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right font-bold text-emerald-800 text-base">
                      {fmt(history.reduce((s, e) => s + e.amount, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ADD PAYOUT MODAL */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Add Payout — {monthLabel(month)}</h3>
              <button onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_ADD }); }}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Name *</label>
                <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Type *</label>
                  <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value as typeof addForm.type }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="employee">Employee</option>
                    <option value="freelancer">Vendor / Freelancer</option>
                    <option value="intern">Intern</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Amount (₹) *</label>
                  <input type="number" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Vertical</label>
                <select value={addForm.vertical_id} onChange={e => setAddForm(f => ({ ...f, vertical_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">General</option>
                  {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Notes</label>
                <input value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Invoice ref, project name, etc."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_ADD }); }}
                className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={submitAdd} disabled={addSaving || !addForm.name.trim() || !addForm.amount}
                className="flex-1 py-2.5 text-sm bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {addSaving ? "Saving…" : "Add Payout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
