"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  Megaphone, Plus, X, Check, Loader2, Trash2, Pencil, Search, Calendar,
  ArrowDownLeft, ArrowUpRight,
} from "lucide-react";

const supabase = createClient();

const STATUSES = ["draft", "pitched", "negotiation", "approved", "completed", "lost"] as const;
type Status = typeof STATUSES[number];

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:       { label: "Draft",       color: "bg-slate-100 text-slate-600" },
  pitched:     { label: "Pitched",     color: "bg-blue-100 text-blue-700" },
  negotiation: { label: "Negotiation", color: "bg-amber-100 text-amber-700" },
  approved:    { label: "Approved",    color: "bg-emerald-100 text-emerald-700" },
  completed:   { label: "Completed",   color: "bg-indigo-100 text-indigo-700" },
  lost:        { label: "Lost",        color: "bg-rose-100 text-rose-600" },
};

const ACTIVE_STATUSES = ["draft", "pitched", "negotiation"];

interface OMLead {
  id: string;
  company_name: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  property_id?: string;
  property_name?: string;
  lead_type: "inbound" | "outbound";
  status: Status;
  deal_value?: number;
  notes?: string;
  next_follow_up?: string;
  assigned_to?: string;
  created_by?: string;
  created_at: string;
}

interface Props {
  userId: string;
  properties: { id: string; name: string }[];
  members: { id: string; full_name: string }[];
}

const EMPTY = {
  id: "", company_name: "", contact_name: "", contact_email: "", contact_phone: "",
  property_id: "", lead_type: "inbound" as "inbound" | "outbound",
  status: "draft" as Status, deal_value: "", notes: "", next_follow_up: "", assigned_to: "",
};

function fmt(n?: number) {
  if (!n) return "—";
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function OwnedMediaSalesClient({ userId, properties, members }: Props) {
  const [leads, setLeads] = useState<OMLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProperty, setFilterProperty] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("owned_media_leads").select("*").order("created_at", { ascending: false });
    setLeads((data || []) as OMLead[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function propName(id?: string) {
    return properties.find(p => p.id === id)?.name || "";
  }

  function memberName(id?: string) {
    return members.find(m => m.id === id)?.full_name || "";
  }

  async function save() {
    if (!form.company_name.trim()) return;
    setSaving(true);
    const payload = {
      company_name: form.company_name.trim(),
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      property_id: form.property_id || null,
      property_name: propName(form.property_id) || null,
      lead_type: form.lead_type,
      status: form.status,
      deal_value: form.deal_value ? parseFloat(form.deal_value) : null,
      notes: form.notes || null,
      next_follow_up: form.next_follow_up || null,
      assigned_to: form.assigned_to || null,
      updated_at: new Date().toISOString(),
    };
    if (form.id) {
      const { data, error } = await supabase.from("owned_media_leads").update(payload).eq("id", form.id).select().single();
      setSaving(false);
      if (error) { alert(`Failed to save: ${error.message}`); return; }
      if (data) setLeads(prev => prev.map(l => l.id === form.id ? data as OMLead : l));
      if (payload.status === "approved") syncToClients(data as OMLead);
    } else {
      const { data, error } = await supabase.from("owned_media_leads")
        .insert({ ...payload, created_by: userId }).select().single();
      setSaving(false);
      if (error) { alert(`Failed to save: ${error.message}`); return; }
      if (data) setLeads(prev => [data as OMLead, ...prev]);
      if (payload.status === "approved") syncToClients(data as OMLead);
    }
    setShowForm(false);
    setForm({ ...EMPTY });
  }

  // Approved owned-media leads land in Client Details as one-time clients
  async function syncToClients(lead: OMLead) {
    try {
      const { data: existing } = await supabase.from("clients").select("id").eq("name", lead.company_name).maybeSingle();
      const payload = {
        name: lead.company_name,
        contact_name: lead.contact_name || null,
        contact_email: lead.contact_email || null,
        contact_phone: lead.contact_phone || null,
        engagement_type: "one_time",
        amount: lead.deal_value || 0,
        deliverables: `Owned media promotion${lead.property_name ? ` — ${lead.property_name}` : ""}`,
        status: "active",
        notes: lead.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (existing) await supabase.from("clients").update(payload).eq("id", existing.id);
      else await supabase.from("clients").insert({ ...payload, created_at: new Date().toISOString() });
    } catch { alert("Approved, but could not sync to Client Details."); }
  }

  async function updateStatus(lead: OMLead, status: Status) {
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status } : l));
    const { error } = await supabase.from("owned_media_leads")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) {
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: lead.status } : l));
      alert(`Failed to save status: ${error.message}`);
      return;
    }
    if (status === "approved") syncToClients({ ...lead, status });
  }

  async function updateFollowUp(lead: OMLead, value: string) {
    const v = value || null;
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, next_follow_up: v || undefined } : l));
    await supabase.from("owned_media_leads").update({ next_follow_up: v }).eq("id", lead.id);
  }

  async function remove(lead: OMLead) {
    if (!confirm(`Delete lead "${lead.company_name}"?`)) return;
    await supabase.from("owned_media_leads").delete().eq("id", lead.id);
    setLeads(prev => prev.filter(l => l.id !== lead.id));
  }

  function openEdit(l: OMLead) {
    setForm({
      id: l.id, company_name: l.company_name, contact_name: l.contact_name || "",
      contact_email: l.contact_email || "", contact_phone: l.contact_phone || "",
      property_id: l.property_id || "", lead_type: l.lead_type || "inbound",
      status: l.status, deal_value: l.deal_value?.toString() || "",
      notes: l.notes || "", next_follow_up: l.next_follow_up ? l.next_follow_up.slice(0, 10) : "",
      assigned_to: l.assigned_to || "",
    });
    setShowForm(true);
  }

  const filtered = leads.filter(l => {
    if (search && !l.company_name.toLowerCase().includes(search.toLowerCase())
      && !(l.contact_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && l.status !== filterStatus) return false;
    if (filterProperty && l.property_id !== filterProperty) return false;
    if (filterType && l.lead_type !== filterType) return false;
    if (filterMonth && !String(l.created_at || "").startsWith(filterMonth)) return false;
    if (filterAssignee && l.assigned_to !== filterAssignee) return false;
    return true;
  });

  // KPIs
  const activeLeads = leads.filter(l => ACTIVE_STATUSES.includes(l.status));
  const pipelineValue = activeLeads.reduce((s, l) => s + (l.deal_value || 0), 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const approvedLeads = leads.filter(l => ["approved", "completed"].includes(l.status));
  const approvedThisMonth = approvedLeads
    .filter(l => String(l.created_at || "").startsWith(thisMonth) || false)
    .reduce((s, l) => s + (l.deal_value || 0), 0);
  const approvedTotal = approvedLeads.reduce((s, l) => s + (l.deal_value || 0), 0);
  const inboundCount = leads.filter(l => l.lead_type === "inbound").length;

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-sm">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Owned Media Sales</h1>
              <p className="text-xs text-slate-400">Inbound & outbound promotion leads for our owned pages — tracked separately</p>
            </div>
          </div>
          <button onClick={() => { setForm({ ...EMPTY }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 shadow-sm">
            <Plus className="w-4 h-4" /> Add Lead
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-slate-500 mb-1">Active Pipeline</p>
            <p className="text-xl font-bold text-slate-800">{fmt(pipelineValue)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{activeLeads.length} open leads</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-emerald-600 mb-1">Approved This Month</p>
            <p className="text-xl font-bold text-emerald-800">{fmt(approvedThisMonth)}</p>
            <p className="text-xs text-emerald-400 mt-0.5">added this month</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-indigo-600 mb-1">Total Approved</p>
            <p className="text-xl font-bold text-indigo-800">{fmt(approvedTotal)}</p>
            <p className="text-xs text-indigo-400 mt-0.5">{approvedLeads.length} deals all-time</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-amber-600 mb-1">Inbound / Outbound</p>
            <p className="text-xl font-bold text-amber-800">{inboundCount} / {leads.length - inboundCount}</p>
            <p className="text-xs text-amber-400 mt-0.5">lead sources</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 w-44" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">All Platforms</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">All Assignees</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">Inbound & Outbound</option>
            <option value="inbound">Inbound only</option>
            <option value="outbound">Outbound only</option>
          </select>
          <div className="flex items-center gap-1">
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600" />
            {filterMonth && <button onClick={() => setFilterMonth("")} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-orange-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No owned media leads yet</p>
            <p className="text-xs mt-1">Track brands reaching out (or being pitched) for promotions on your owned pages.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[960px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Company</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Platform</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Assigned To</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Value</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Added</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Follow-up</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50/50 group">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{l.company_name}</p>
                        {l.contact_name && <p className="text-xs text-slate-400">{l.contact_name}{l.contact_phone ? ` · ${l.contact_phone}` : ""}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${l.lead_type === "inbound" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
                          {l.lead_type === "inbound" ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {l.lead_type === "inbound" ? "Inbound" : "Outbound"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {l.property_name
                          ? <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">{l.property_name}</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {l.assigned_to ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                              {memberName(l.assigned_to).charAt(0).toUpperCase()}
                            </span>
                            <span className="text-xs text-slate-700">{memberName(l.assigned_to)}</span>
                          </span>
                        ) : <span className="text-xs text-slate-300">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3">
                        <select value={l.status} onChange={e => updateStatus(l, e.target.value as Status)}
                          className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${STATUS_META[l.status]?.color}`}>
                          {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{fmt(l.deal_value)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {new Date(l.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input type="date" value={(l.next_follow_up || "").slice(0, 10)}
                          onChange={e => updateFollowUp(l, e.target.value)}
                          className={`text-xs border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400 ${l.next_follow_up && new Date(l.next_follow_up) < new Date() ? "text-red-500 border-red-200" : "text-slate-600 border-slate-200"}`} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEdit(l)} className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => remove(l)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">{form.id ? "Edit Lead" : "Add Owned Media Lead"}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              {/* Inbound / Outbound */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button onClick={() => setForm(f => ({ ...f, lead_type: "inbound" }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${form.lead_type === "inbound" ? "bg-white shadow text-emerald-700" : "text-slate-500"}`}>
                  <ArrowDownLeft className="w-3.5 h-3.5" /> Inbound
                </button>
                <button onClick={() => setForm(f => ({ ...f, lead_type: "outbound" }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${form.lead_type === "outbound" ? "bg-white shadow text-sky-700" : "text-slate-500"}`}>
                  <ArrowUpRight className="w-3.5 h-3.5" /> Outbound
                </button>
              </div>

              <input autoFocus value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                placeholder="Company / Brand name *"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />

              <div className="grid grid-cols-2 gap-2">
                <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                  placeholder="Contact name"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="Phone" type="tel"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                placeholder="Email" type="email"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Platform (Owned Media)</label>
                  <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Select platform…</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Assigned To</label>
                  <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Deal Value (₹)</label>
                  <input type="number" onWheel={e => e.currentTarget.blur()} value={form.deal_value}
                    onChange={e => setForm(f => ({ ...f, deal_value: e.target.value }))}
                    placeholder="50000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Next Follow-up</label>
                  <input type="date" value={form.next_follow_up}
                    onChange={e => setForm(f => ({ ...f, next_follow_up: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              </div>

              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Notes — what they want, deliverables discussed…" rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />

              {form.status === "approved" && (
                <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  ✓ Approved leads are added to Client Details automatically as one-time clients.
                </p>
              )}
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={save} disabled={saving || !form.company_name.trim()}
                className="flex-1 py-2.5 text-sm bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? "Saving…" : form.id ? "Save Changes" : "Add Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
