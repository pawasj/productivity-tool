"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  TrendingUp, Plus, X, Search, FileText,
  MapPin, Edit3, Trash2, ExternalLink, CheckCircle2,
} from "lucide-react";
import type { Lead, Profile, Vertical } from "@/lib/types";
import { STATUS_COLORS, formatDate } from "@/lib/utils";

interface Props {
  initialLeads: Lead[];
  initialBriefs: Record<string, unknown>[];
  members: Profile[];
  verticals: Vertical[];
  profile: Profile;
  userId: string;
}

const STATUSES = ["new", "contacted", "proposal", "negotiation", "won", "lost", "on_hold"] as const;
const STATUS_LABELS: Record<string, string> = {
  new: "New", contacted: "Contacted", proposal: "Proposal",
  negotiation: "Negotiation", won: "Won", lost: "Lost", on_hold: "On Hold",
};

type FormState = {
  company_name: string; contact_name: string; contact_email: string; contact_phone: string;
  status: Lead["status"]; our_poc_id: string; vertical_id: string; location: string;
  deal_value: string; latest_update: string; notes: string; next_follow_up: string;
};

const EMPTY_LEAD: FormState = {
  company_name: "", contact_name: "", contact_email: "", contact_phone: "",
  status: "new", our_poc_id: "", vertical_id: "", location: "",
  deal_value: "", latest_update: "", notes: "", next_follow_up: "",
};

// Unified row type for display
type PipelineRow =
  | { kind: "lead"; data: Lead }
  | { kind: "brief"; data: Record<string, unknown> };

const BRIEF_STATUSES = ["draft", "submitted", "approved", "completed"] as const;
const BRIEF_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-violet-100 text-violet-700",
  completed: "bg-emerald-100 text-emerald-700",
};

export default function PipelineClient({ initialLeads, initialBriefs, members, verticals, profile, userId }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [briefs, setBriefs] = useState<Record<string, unknown>[]>(initialBriefs);
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterVertical, setFilterVertical] = useState<string>("");
  const [filterPoc, setFilterPoc] = useState<string>("");
  const [filterType, setFilterType] = useState<"all" | "leads" | "briefs">("all");
  const supabase = createClient();
  const router = useRouter();

  const rows = useMemo((): PipelineRow[] => {
    const leadRows: PipelineRow[] = leads.map(l => ({ kind: "lead", data: l }));
    const briefRows: PipelineRow[] = briefs.map(b => ({ kind: "brief", data: b }));
    return [...leadRows, ...briefRows].filter(row => {
      const name = row.kind === "lead"
        ? (row.data as Lead).company_name
        : String(row.data.client_name || "");
      const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === "all" || (filterType === "leads" && row.kind === "lead") || (filterType === "briefs" && row.kind === "brief");
      const matchStatus = !filterStatus || (row.kind === "lead" && (row.data as Lead).status === filterStatus);
      const matchVertical = !filterVertical || (row.kind === "lead"
        ? (row.data as Lead).vertical_id === filterVertical
        : row.data.vertical_id === filterVertical);
      const matchPoc = !filterPoc || (row.kind === "lead" && (row.data as Lead).our_poc_id === filterPoc);
      return matchSearch && matchType && matchStatus && matchVertical && matchPoc;
    });
  }, [leads, initialBriefs, search, filterType, filterStatus, filterVertical, filterPoc]);

  const stats = useMemo(() => {
    const active = leads.filter(l => !["won", "lost"].includes(l.status));
    const won = leads.filter(l => l.status === "won");
    const totalPipeline = active.reduce((s, l) => s + (l.deal_value || 0), 0);
    const totalWon = won.reduce((s, l) => s + (l.deal_value || 0), 0);
    return { active: active.length, won: won.length, totalPipeline, totalWon, briefCount: briefs.length };
  }, [leads, briefs]);

  async function updateBriefStatus(briefId: string, status: string) {
    await supabase.from("client_briefs").update({ status }).eq("id", briefId);
    setBriefs(prev => prev.map(b => String(b.id) === briefId ? { ...b, status } : b));
    if (status === "completed") router.push(`/dashboard/results?brief=${briefId}`);
  }

  function openAdd() {
    setForm({ ...EMPTY_LEAD, our_poc_id: userId, vertical_id: verticals[0]?.id || "" });
    setEditingLead(null);
    setShowForm(true);
  }

  function openEdit(lead: Lead) {
    setForm({
      company_name: lead.company_name,
      contact_name: lead.contact_name,
      contact_email: lead.contact_email || "",
      contact_phone: lead.contact_phone || "",
      status: lead.status,
      our_poc_id: lead.our_poc_id || "",
      vertical_id: lead.vertical_id,
      location: lead.location || "",
      deal_value: lead.deal_value?.toString() || "",
      latest_update: lead.latest_update || "",
      notes: lead.notes || "",
      next_follow_up: lead.next_follow_up ? lead.next_follow_up.slice(0, 16) : "",
    });
    setEditingLead(lead);
    setShowForm(true);
  }

  async function saveLead() {
    if (!form.company_name.trim() || !form.contact_name.trim()) return;
    setSaving(true);
    const payload = {
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim(),
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      status: form.status,
      our_poc_id: form.our_poc_id || null,
      vertical_id: form.vertical_id,
      location: form.location || null,
      deal_value: form.deal_value ? parseFloat(form.deal_value) : null,
      latest_update: form.latest_update || null,
      notes: form.notes || null,
      next_follow_up: form.next_follow_up || null,
      updated_at: new Date().toISOString(),
    };

    if (editingLead) {
      const { data } = await supabase.from("leads").update(payload).eq("id", editingLead.id)
        .select("*, our_poc:profiles!leads_our_poc_id_fkey(full_name, email), vertical:verticals(name, color)").single();
      if (data) setLeads(leads.map(l => l.id === editingLead.id ? data as Lead : l));
    } else {
      const { data } = await supabase.from("leads").insert(payload)
        .select("*, our_poc:profiles!leads_our_poc_id_fkey(full_name, email), vertical:verticals(name, color)").single();
      if (data) setLeads([data as Lead, ...leads]);
    }
    setSaving(false);
    setShowForm(false);
    setEditingLead(null);
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    await supabase.from("leads").delete().eq("id", id);
    setLeads(leads.filter(l => l.id !== id));
  }

  async function updateStatus(lead: Lead, status: Lead["status"]) {
    const { data } = await supabase.from("leads")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", lead.id)
      .select("*, our_poc:profiles!leads_our_poc_id_fkey(full_name, email), vertical:verticals(name, color)")
      .single();
    if (data) setLeads(leads.map(l => l.id === lead.id ? data as Lead : l));
  }

  function openBriefInDistro(briefId: string, tab?: "brief") {
    router.push(`/dashboard/distro?brief=${briefId}${tab ? `&tab=${tab}` : ""}`);
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Sales Pipeline</h1>
              <p className="text-xs text-slate-400">All leads — manual and campaign briefs — in one place</p>
            </div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Lead
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Active Leads", value: stats.active, color: "indigo" },
            { label: "Won", value: stats.won, color: "emerald" },
            { label: "Campaign Briefs", value: stats.briefCount, color: "violet" },
            { label: "Pipeline Value", value: `₹${(stats.totalPipeline / 100000).toFixed(1)}L`, color: "blue" },
            { label: "Won Revenue", value: `₹${(stats.totalWon / 100000).toFixed(1)}L`, color: "green" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`bg-${color}-50 border border-${color}-100 rounded-xl px-4 py-3`}>
              <p className={`text-xs font-medium text-${color}-600 mb-0.5`}>{label}</p>
              <p className={`text-xl font-bold text-${color}-700`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search company / client…"
            className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
        </div>

        {/* Type tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {(["all", "leads", "briefs"] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${filterType === t ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {t === "all" ? "All" : t === "leads" ? "Manual Leads" : "Campaign Briefs"}
            </button>
          ))}
        </div>

        {filterType !== "briefs" && (
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        )}
        <select value={filterVertical} onChange={e => setFilterVertical(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600">
          <option value="">All Verticals</option>
          {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
        </select>
        {filterType !== "briefs" && (
          <select value={filterPoc} onChange={e => setFilterPoc(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600">
            <option value="">All POCs</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        )}
        {(search || filterStatus || filterVertical || filterPoc || filterType !== "all") && (
          <button onClick={() => { setSearch(""); setFilterStatus(""); setFilterVertical(""); setFilterPoc(""); setFilterType("all"); }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{rows.length} entr{rows.length !== 1 ? "ies" : "y"}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Company / Client</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Contact / Industry</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Vertical</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">POC / By</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Value</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">No entries found</p>
                    <p className="text-xs mt-1">Add a lead or create a campaign brief in Distribution Hub</p>
                  </td>
                </tr>
              )}
              {rows.map((row, idx) => {
                if (row.kind === "lead") {
                  const lead = row.data;
                  const vertical = verticals.find(v => v.id === lead.vertical_id);
                  return (
                    <tr key={`lead-${lead.id}`} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Lead</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 text-sm">{lead.company_name}</p>
                        {lead.location && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span className="text-xs text-slate-400">{lead.location}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-700">{lead.contact_name}</p>
                        {lead.contact_email && <p className="text-xs text-slate-400">{lead.contact_email}</p>}
                        {lead.contact_phone && <p className="text-xs text-slate-400">{lead.contact_phone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {vertical && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${vertical.color}20`, color: vertical.color }}>
                            {vertical.icon} {vertical.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={lead.status}
                          onChange={e => updateStatus(lead, e.target.value as Lead["status"])}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${STATUS_COLORS[lead.status]}`}>
                          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {(lead.our_poc as Profile)?.full_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 font-medium">
                        {lead.deal_value ? `₹${lead.deal_value.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-500">{lead.next_follow_up ? formatDate(lead.next_follow_up) : "—"}</p>
                        <p className="text-xs text-slate-400">{formatDate(lead.updated_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            onClick={() => {
                              const prefill = encodeURIComponent(JSON.stringify({
                                brand_name: lead.company_name,
                                poc_name: lead.contact_name,
                                total_budget: lead.deal_value?.toString() || "",
                                target_geography: lead.location || "",
                                additional_notes: lead.notes || "",
                                lead_id: lead.id,
                              }));
                              router.push(`/dashboard/distro?prefill=${prefill}`);
                            }}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium whitespace-nowrap">
                            <ExternalLink className="w-3 h-3" /> Create Brief
                          </button>
                          <button onClick={() => openEdit(lead)} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors" title="Edit lead">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteLead(lead.id)} className="p-1.5 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                // Brief row
                const brief = row.data;
                const creator = (brief.creator as Record<string, unknown>) || null;
                return (
                  <tr key={`brief-${brief.id}`} className="hover:bg-violet-50/30 transition-colors group">
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium flex items-center gap-1 w-fit">
                        <FileText className="w-3 h-3" /> Brief
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 text-sm">{String(brief.brand_name || "—")}</p>
                      <p className="text-xs text-slate-400 capitalize">{String(brief.campaign_type || "")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-600">{String(brief.industry || "—")}</p>
                      {Boolean(brief.target_audience) && (
                        <p className="text-xs text-slate-400 max-w-40 truncate">{String(brief.target_audience)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400">—</span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={String(brief.status || "draft")}
                        onChange={e => updateBriefStatus(String(brief.id), e.target.value)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${BRIEF_STATUS_COLORS[String(brief.status || "draft")] || "bg-slate-100 text-slate-600"}`}>
                        {BRIEF_STATUSES.map(s => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {String(creator?.full_name || "—")}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {brief.total_budget
                        ? `₹${Number(brief.total_budget).toLocaleString("en-IN")}`
                        : brief.platforms
                          ? <span className="text-xs text-slate-400">Plan pending</span>
                          : "—"
                      }
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-400">{formatDate(String(brief.created_at || ""))}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openBriefInDistro(String(brief.id))}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium whitespace-nowrap">
                          <ExternalLink className="w-3 h-3" /> Open Brief
                        </button>
                        {!Boolean(brief.media_plan) && (
                          <button
                            onClick={() => openBriefInDistro(String(brief.id))}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors font-medium whitespace-nowrap">
                            + Media Plan
                          </button>
                        )}
                        {Boolean(brief.media_plan) && !Boolean(brief.narrative) && (
                          <button
                            onClick={() => openBriefInDistro(String(brief.id))}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors font-medium whitespace-nowrap">
                            + Narrative
                          </button>
                        )}
                        {String(brief.status || "") !== "completed" && Boolean(brief.media_plan_json) && (
                          <button
                            onClick={async () => {
                              const supabase = createClient();
                              await supabase.from("client_briefs").update({ status: "completed" }).eq("id", String(brief.id));
                              router.push(`/dashboard/results?brief=${brief.id}`);
                            }}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" /> Mark Complete
                          </button>
                        )}
                        {String(brief.status || "") === "completed" && (
                          <button
                            onClick={() => router.push(`/dashboard/results?brief=${brief.id}`)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors font-medium whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" /> View Results
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
      </div>

      {/* Add/Edit Lead Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-slate-900">{editingLead ? "Edit Lead" : "Add New Lead"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
                <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })}
                  placeholder="e.g. Reliance Brands"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name *</label>
                <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })}
                  placeholder="Client POC name"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                <input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="poc@company.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Phone</label>
                <input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="City / Region"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vertical</label>
                <select value={form.vertical_id} onChange={e => setForm({ ...form, vertical_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Lead["status"] })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Our POC</label>
                <select value={form.our_poc_id} onChange={e => setForm({ ...form, our_poc_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select POC</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deal Value (₹)</label>
                <input type="number" value={form.deal_value} onChange={e => setForm({ ...form, deal_value: e.target.value })}
                  placeholder="500000"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Next Follow-up</label>
                <input type="datetime-local" value={form.next_follow_up} onChange={e => setForm({ ...form, next_follow_up: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Latest Update</label>
                <input value={form.latest_update} onChange={e => setForm({ ...form, latest_update: e.target.value })}
                  placeholder="What's the latest on this lead?"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional context, requirements, history…"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={saveLead} disabled={saving || !form.company_name.trim() || !form.contact_name.trim()}
                className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : editingLead ? "Update Lead" : "Add Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
