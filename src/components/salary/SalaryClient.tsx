"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { IndianRupee, Loader2, Calendar, Pencil, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import type { Vertical, Profile } from "@/lib/types";

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

// A unified "roster person" drawn from any source
interface RosterPerson {
  key: string;            // unique across all sources
  source_id: string;      // profile.id or vendor.id
  name: string;
  role: string;
  department?: string;
  category: "employee" | "intern" | "freelancer";
  default_rate?: number;
}

// Stable singleton — created once, not on every render
const supabase = createClient();

function fmt(n: number) { return n ? `₹${n.toLocaleString("en-IN")}` : "—"; }

const CAT_STYLES: Record<string, string> = {
  employee: "bg-blue-100 text-blue-700",
  intern: "bg-violet-100 text-violet-700",
  freelancer: "bg-amber-100 text-amber-700",
};

export default function SalaryClient({ userId, verticals, members: initialMembers, vendors: initialVendors }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [entries, setEntries] = useState<SalaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Profile[]>(initialMembers);
  const [vendors, setVendors] = useState<VendorRow[]>(initialVendors);
  // editing: key of the roster row being edited inline
  const [editing, setEditing] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editVerticalId, setEditVerticalId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Build roster from all three sources
  const roster: RosterPerson[] = [
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

  // Client-side fallback: re-fetch roster if server props were empty
  useEffect(() => {
    async function fetchRoster() {
      if (initialMembers.length === 0) {
        const { data } = await supabase.from("profiles").select("id, full_name, designation, department, role").order("full_name");
        if (data?.length) setMembers(data as Profile[]);
      }
      if (initialVendors.length === 0) {
        const { data } = await supabase.from("vendors").select("id, name, type, service_type, rate").order("name");
        if (data?.length) setVendors(data as VendorRow[]);
      }
    }
    fetchRoster();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("salary_entries")
        .select("*")
        .eq("month", month)
        .order("member_name");
      setEntries((data || []) as SalaryEntry[]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // Find existing entry for a roster person
  function entryFor(person: RosterPerson): SalaryEntry | undefined {
    return entries.find(e =>
      e.member_id === person.source_id ||
      e.member_name === person.name
    );
  }

  function startEdit(person: RosterPerson) {
    const entry = entryFor(person);
    setEditing(person.key);
    setEditAmount(entry ? String(entry.amount) : person.default_rate ? String(person.default_rate) : "");
    setEditVerticalId(entry?.vertical_id || "");
    setEditNotes(entry?.notes || "");
  }

  function cancelEdit() {
    setEditing(null);
    setEditAmount("");
    setEditVerticalId("");
    setEditNotes("");
  }

  async function saveEntry(person: RosterPerson) {
    if (!editAmount) return;
    setSaving(true);
    const amount = parseFloat(editAmount);
    const existing = entryFor(person);

    const payload = {
      member_id: person.source_id,
      member_name: person.name,
      member_type: person.category,
      department: person.department || null,
      vertical_id: editVerticalId || null,
      amount,
      month,
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

    // Sync to expenses for P&L / Expense Report
    await supabase.from("expenses").upsert({
      category: "Salaries",
      description: `${person.name} (${person.category})`,
      amount,
      month,
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
    if (!confirm(`Remove ${person.name}'s entry for ${monthLabel}?`)) return;
    await supabase.from("salary_entries").delete().eq("id", existing.id);
    await supabase.from("expenses").delete()
      .eq("category", "Salaries")
      .eq("description", `${person.name} (${person.category})`)
      .eq("month", month);
    setEntries(prev => prev.filter(e => e.id !== existing.id));
  }

  const monthLabel = new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const total = entries.reduce((s, e) => s + e.amount, 0);

  const SECTIONS = [
    { key: "employee", label: "Employees", icon: "👤", people: roster.filter(r => r.category === "employee") },
    { key: "intern", label: "Interns", icon: "🎓", people: roster.filter(r => r.category === "intern") },
    { key: "freelancer", label: "Vendors & Freelancers", icon: "🤝", people: roster.filter(r => r.category === "freelancer") },
  ].filter(s => s.people.length > 0);

  const sectionTotals = (cat: string) =>
    entries.filter(e => e.member_type === cat).reduce((s, e) => s + e.amount, 0);
  const sectionSet = (cat: string) =>
    entries.filter(e => e.member_type === cat).length;

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
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            <p className="text-xs text-emerald-600 font-medium">Total Payroll</p>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{fmt(total)}</p>
            <p className="text-xs text-emerald-400">{monthLabel}</p>
          </div>
          {SECTIONS.map(s => (
            <div key={s.key} className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium">{s.icon} {s.label}</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5">{fmt(sectionTotals(s.key))}</p>
              <p className="text-xs text-slate-400">{sectionSet(s.key)} / {s.people.length} set</p>
            </div>
          ))}
        </div>
      </div>

      {/* Roster */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
        ) : (
          SECTIONS.map(section => (
            <div key={section.key} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Section header */}
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
                  {collapsed[section.key]
                    ? <ChevronRight className="w-4 h-4 text-slate-400" />
                    : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </button>

              {!collapsed[section.key] && (
                <div className="divide-y divide-slate-50">
                  {section.people.map(person => {
                    const entry = entryFor(person);
                    const isEditing = editing === person.key;
                    return (
                      <div key={person.key}
                        className={`flex items-center gap-3 px-5 py-3 transition-colors ${isEditing ? "bg-emerald-50/60" : "hover:bg-slate-50/50"}`}>
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0">
                          {person.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Name + role */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-900 text-sm">{person.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CAT_STYLES[person.category]}`}>
                              {person.category}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            {person.role}{person.department ? ` · ${person.department}` : ""}
                          </p>
                        </div>

                        {/* Amount display or edit fields */}
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                            <div className="relative">
                              <span className="absolute left-2.5 top-2 text-xs text-slate-400 font-medium">₹</span>
                              <input
                                autoFocus
                                type="number"
                                value={editAmount}
                                onChange={e => setEditAmount(e.target.value)}
                                placeholder="Amount"
                                className="w-28 pl-6 pr-2 py-1.5 border border-emerald-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                              />
                            </div>
                            <select value={editVerticalId} onChange={e => setEditVerticalId(e.target.value)}
                              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 text-slate-600">
                              <option value="">General</option>
                              {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                            <input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                              placeholder="Notes (optional)"
                              className="w-32 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 text-slate-600" />
                            <div className="flex gap-1">
                              <button onClick={() => saveEntry(person)} disabled={saving || !editAmount}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
                                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Save
                              </button>
                              <button onClick={cancelEdit} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 shrink-0">
                            {entry ? (
                              <div className="text-right">
                                <p className="font-bold text-slate-900 text-sm">{fmt(entry.amount)}</p>
                                {entry.notes && <p className="text-xs text-slate-400 truncate max-w-[120px]">{entry.notes}</p>}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300 italic">Not set</span>
                            )}
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
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
