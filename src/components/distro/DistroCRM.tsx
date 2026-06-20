"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { ChevronDown, ChevronUp, Download, FileText, Wand2, Search, Plus, X, Check, Pencil, ExternalLink } from "lucide-react";
import * as XLSX from "xlsx";

type CRMEntry = {
  id: string;
  brand_name: string;
  poc_name?: string;
  campaign_type?: string;
  industry?: string;
  total_budget?: number;
  status: string;
  source: string; // "distro" | "sales"
  created_at: string;
  created_by?: string;
  creator_name?: string;
  media_plan_json?: Record<string, unknown>[];
  narrative_text?: string;
  // Sales pipeline specific
  lead_value?: number;
  vertical?: string;
  notes?: string;
};

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  shipped:  "bg-violet-50 text-violet-700 border-violet-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  // sales pipeline
  prospect: "bg-amber-50 text-amber-700 border-amber-200",
  active:   "bg-blue-50 text-blue-700 border-blue-200",
  closed:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  lost:     "bg-rose-50 text-rose-700 border-rose-200",
};

const DISTRO_STATUSES = ["draft", "approved", "shipped", "accepted", "rejected"];
const SALES_STATUSES = ["prospect", "active", "closed", "lost"];

const EMPTY_LEAD = { brand_name: "", poc_name: "", industry: "", campaign_type: "", lead_value: "", vertical: "", notes: "", status: "prospect" };

interface DistroCRMProps {
  onOpenBrief?: (id: string) => void;
}

export default function DistroCRM({ onOpenBrief }: DistroCRMProps = {}) {
  const [entries, setEntries] = useState<CRMEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [allUsers, setAllUsers] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [leadForm, setLeadForm] = useState(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Load distribution campaign briefs
    const { data: briefs } = await supabase
      .from("client_briefs")
      .select("*, profiles:created_by(full_name)")
      .order("created_at", { ascending: false });

    // Load sales pipeline — join with vertical name
    const { data: leads } = await supabase
      .from("leads")
      .select("*, verticals:vertical_id(name), pocs:our_poc_id(full_name)")
      .order("created_at", { ascending: false });

    const distroEntries: CRMEntry[] = (briefs || []).map((b: Record<string, unknown>) => ({
      id: b.id as string,
      brand_name: b.brand_name as string || "Unnamed",
      poc_name: (b.poc_name || b.brand_poc) as string,
      campaign_type: (b.campaign_type || b.engagement_type) as string,
      industry: b.industry as string,
      total_budget: (b.total_budget || b.budget) as number,
      status: b.status as string || "draft",
      source: "distro",
      created_at: b.created_at as string,
      created_by: b.created_by as string,
      creator_name: (b.profiles as Record<string, unknown> | null)?.full_name as string || "Unknown",
      media_plan_json: b.media_plan_json as Record<string, unknown>[],
      narrative_text: b.narrative_text as string,
    }));

    const salesEntries: CRMEntry[] = (leads || []).map((l: Record<string, unknown>) => ({
      id: l.id as string,
      brand_name: l.company_name as string || "Unnamed Lead",
      poc_name: l.contact_name as string,
      campaign_type: undefined,
      industry: undefined,
      total_budget: l.deal_value as number,
      status: l.status as string || "new",
      source: "sales",
      created_at: l.created_at as string,
      created_by: l.our_poc_id as string,
      creator_name: (l.pocs as Record<string, unknown> | null)?.full_name as string || "Unknown",
      vertical: (l.verticals as Record<string, unknown> | null)?.name as string,
      notes: l.notes as string,
      lead_value: l.deal_value as number,
    }));

    const all = [...distroEntries, ...salesEntries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setEntries(all);
    // Collect unique creator names for filter
    const names = [...new Set(all.map(e => e.creator_name).filter(Boolean))] as string[];
    setAllUsers(names.sort());
    setLoading(false);
    void user;
  }

  async function updateStatus(id: string, status: string, source: string) {
    const table = source === "distro" ? "client_briefs" : "leads";
    await supabase.from(table).update({ status }).eq("id", id);
    setEntries(e => e.map(x => x.id === id ? { ...x, status } : x));
  }

  async function addLead() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    // Find vertical_id if vertical name provided
    let vertical_id: string | null = null;
    if (leadForm.vertical) {
      const { data: verts } = await supabase.from("verticals").select("id").ilike("name", `%${leadForm.vertical}%`).limit(1).single();
      vertical_id = (verts as Record<string, string> | null)?.id || null;
    }
    // leads table requires vertical_id and company_name
    if (!vertical_id) {
      const { data: firstVert } = await supabase.from("verticals").select("id").limit(1).single();
      vertical_id = (firstVert as Record<string, string> | null)?.id || null;
    }
    if (!vertical_id) { setSaving(false); return; }
    const { data } = await supabase.from("leads").insert({
      company_name: leadForm.brand_name,
      contact_name: leadForm.poc_name || "TBD",
      deal_value: parseFloat(leadForm.lead_value) || null,
      notes: [leadForm.notes, leadForm.industry && `Industry: ${leadForm.industry}`, leadForm.campaign_type && `Type: ${leadForm.campaign_type}`].filter(Boolean).join("\n") || null,
      status: leadForm.status === "prospect" ? "new" : leadForm.status,
      our_poc_id: user?.id,
      vertical_id,
    }).select().single();
    if (data) {
      const entry: CRMEntry = {
        id: (data as Record<string, unknown>).id as string,
        brand_name: leadForm.brand_name,
        poc_name: leadForm.poc_name,
        industry: leadForm.industry,
        campaign_type: leadForm.campaign_type,
        total_budget: parseFloat(leadForm.lead_value) || undefined,
        status: leadForm.status,
        source: "sales",
        created_at: new Date().toISOString(),
        creator_name: "You",
        notes: leadForm.notes,
        vertical: leadForm.vertical,
      };
      setEntries(prev => [entry, ...prev]);
    }
    setSaving(false);
    setShowAdd(false);
    setLeadForm(EMPTY_LEAD);
  }

  function exportAll() {
    const rows = filtered.map(e => ({
      "Brand / Company": e.brand_name,
      "POC": e.poc_name || "",
      "Type": e.source === "distro" ? "Distribution Campaign" : "Sales Lead",
      "Campaign Type": e.campaign_type || "",
      "Industry": e.industry || "",
      "Budget / Value (₹)": e.total_budget || "",
      "Status": e.status,
      "Added By": e.creator_name || "",
      "Date": new Date(e.created_at).toLocaleDateString("en-IN"),
      "Vertical": e.vertical || "",
      "Notes": e.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CRM");
    XLSX.writeFile(wb, `BCC_CRM_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportNarrative(e: CRMEntry) {
    if (!e.narrative_text) return;
    const blob = new Blob([e.narrative_text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${e.brand_name}_Narrative.txt`;
    a.click();
  }

  function exportPlan(e: CRMEntry) {
    if (!e.media_plan_json?.length) return;
    const ws = XLSX.utils.json_to_sheet(e.media_plan_json);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Media Plan");
    XLSX.writeFile(wb, `${e.brand_name}_MediaPlan.xlsx`);
  }

  const filtered = entries.filter(e => {
    if (search && !e.brand_name.toLowerCase().includes(search.toLowerCase()) && !e.poc_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    if (sourceFilter && e.source !== sourceFilter) return false;
    if (userFilter && e.creator_name !== userFilter) return false;
    return true;
  });

  const totalValue = filtered.reduce((s, e) => s + (e.total_budget || 0), 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brand or POC…"
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All sources</option>
          <option value="distro">Distribution Campaigns</option>
          <option value="sales">Sales Pipeline</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All statuses</option>
          {["draft", "approved", "shipped", "accepted", "rejected", "prospect", "active", "closed", "lost"].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        {allUsers.length > 1 && (
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All team members</option>
            {allUsers.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        <button onClick={exportAll} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors">
          <Download className="w-4 h-4" /> Export
        </button>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Add Lead
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Total Entries</p>
          <p className="text-2xl font-bold text-slate-900">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Pipeline Value</p>
          <p className="text-2xl font-bold text-slate-900">₹{(totalValue / 100000).toFixed(1)}L</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 mb-1">Approved / Closed</p>
          <p className="text-2xl font-bold text-emerald-600">{filtered.filter(e => e.status === "approved" || e.status === "closed").length}</p>
        </div>
      </div>

      {/* Entries list */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading && <div className="text-center py-12 text-slate-400">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            No entries yet. Generate a media plan or add a sales lead.
          </div>
        )}
        {filtered.map(entry => (
          <div key={entry.id} className="border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => setExpanded(x => x === entry.id ? null : entry.id)}>
              {/* Source badge */}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${entry.source === "distro" ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-violet-50 text-violet-600 border-violet-200"}`}>
                {entry.source === "distro" ? "Distro" : "Sales"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 truncate">{entry.brand_name}</span>
                  {entry.vertical && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{entry.vertical}</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {entry.poc_name && <span className="text-xs text-slate-400">{entry.poc_name}</span>}
                  {entry.campaign_type && <span className="text-xs text-slate-400">· {entry.campaign_type}</span>}
                  {entry.creator_name && <span className="text-xs text-slate-400">· by {entry.creator_name}</span>}
                  <span className="text-xs text-slate-300">· {new Date(entry.created_at).toLocaleDateString("en-IN")}</span>
                </div>
              </div>
              {entry.total_budget ? (
                <span className="text-sm font-semibold text-slate-700 shrink-0">
                  ₹{(entry.total_budget / 100000).toFixed(1)}L
                </span>
              ) : null}
              {/* Action icons */}
              {entry.source === "distro" && (
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  {entry.media_plan_json?.length ? (
                    <button onClick={() => exportPlan(entry)} title="Export media plan" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700">
                      <Wand2 className="w-4 h-4" />
                    </button>
                  ) : null}
                  {entry.narrative_text ? (
                    <button onClick={() => exportNarrative(entry)} title="Export narrative" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700">
                      <FileText className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
              )}
              {/* Status pill */}
              <select value={entry.status}
                onChange={e => { e.stopPropagation(); updateStatus(entry.id, e.target.value, entry.source); }}
                onClick={e => e.stopPropagation()}
                className={`text-xs font-medium px-2 py-1 rounded-full border cursor-pointer focus:outline-none shrink-0 ${STATUS_COLORS[entry.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                {(entry.source === "distro" ? DISTRO_STATUSES : SALES_STATUSES).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {expanded === entry.id ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
            </div>

            {/* Expanded detail */}
            {expanded === entry.id && (
              <div className="px-5 pb-5 space-y-4 bg-slate-50/50 border-t border-slate-100">

                {/* Distro: quick-action buttons */}
                {entry.source === "distro" && onOpenBrief && (
                  <div className="pt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => onOpenBrief(entry.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                      {entry.media_plan_json?.length ? "Edit Brief / Plan" : "Open & Add Media Plan"}
                    </button>
                    {!entry.narrative_text && (
                      <button
                        onClick={() => onOpenBrief(entry.id)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors">
                        <FileText className="w-3.5 h-3.5" /> Add Narrative
                      </button>
                    )}
                    {entry.narrative_text && (
                      <button
                        onClick={() => onOpenBrief(entry.id)}
                        className="flex items-center gap-1.5 px-3 py-2 border border-violet-300 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-50 transition-colors">
                        <FileText className="w-3.5 h-3.5" /> Edit Narrative
                      </button>
                    )}
                    <span className="flex items-center gap-1 text-xs text-slate-400 ml-1">
                      <ExternalLink className="w-3 h-3" /> Opens in Brief Planner tab
                    </span>
                  </div>
                )}

                {entry.source === "sales" && entry.notes && (
                  <div className="pt-4">
                    <p className="text-xs font-medium text-slate-500 mb-1 uppercase">Notes</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{entry.notes}</p>
                  </div>
                )}
                {entry.source === "distro" && entry.media_plan_json && entry.media_plan_json.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-slate-500 uppercase">Media Plan ({entry.media_plan_json.length} handles)</p>
                      <button onClick={() => exportPlan(entry)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                        <Download className="w-3 h-3" /> Excel
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="text-xs w-full">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            {Object.keys(entry.media_plan_json[0] || {}).map(k => (
                              <th key={k} className="text-left px-3 py-2 font-semibold text-slate-500 uppercase">{k.replace(/_/g, " ")}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {entry.media_plan_json.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              {Object.values(row).map((v, j) => (
                                <td key={j} className="px-3 py-2 text-slate-700">{String(v ?? "")}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {entry.source === "distro" && entry.narrative_text && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-slate-500 uppercase">Narrative</p>
                      <button onClick={() => exportNarrative(entry)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                        <Download className="w-3 h-3" /> Export Doc
                      </button>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 p-4 text-sm text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                      {entry.narrative_text}
                    </div>
                  </div>
                )}
                {entry.source === "distro" && !entry.media_plan_json?.length && !entry.narrative_text && (
                  <div className="pt-2 pb-1 text-xs text-slate-400 italic">
                    No media plan or narrative yet. Click "Open & Add Media Plan" above to continue.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Lead Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Add Sales Lead</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {[
                { k: "brand_name", label: "Brand / Company *", placeholder: "Company name" },
                { k: "poc_name", label: "POC Name", placeholder: "Contact person" },
                { k: "industry", label: "Industry", placeholder: "e.g. FMCG" },
                { k: "campaign_type", label: "Campaign Type", placeholder: "e.g. Brand Awareness" },
                { k: "lead_value", label: "Deal Value (₹)", placeholder: "e.g. 500000" },
                { k: "vertical", label: "Vertical", placeholder: "e.g. Social Media" },
              ].map(({ k, label, placeholder }) => (
                <div key={k} className={k === "brand_name" ? "col-span-2" : ""}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                  <input value={(leadForm as Record<string, string>)[k]} onChange={e => setLeadForm(f => ({ ...f, [k]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select value={leadForm.status} onChange={e => setLeadForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {SALES_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={leadForm.notes} onChange={e => setLeadForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Any context or next steps…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={addLead} disabled={saving || !leadForm.brand_name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving…" : <><Check className="w-3.5 h-3.5" /> Add Lead</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
