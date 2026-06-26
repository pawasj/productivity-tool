"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  TrendingUp, Plus, X, Search, FileText, BarChart2,
  MapPin, Edit3, Trash2, ExternalLink, CheckCircle2,
  IndianRupee, RefreshCw, Calendar, Repeat2, Zap,
  ArrowRight, AlertTriangle, ChevronDown,
} from "lucide-react";
import type { Lead, Profile, Vertical } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface Props {
  initialLeads: Lead[];
  initialBriefs: Record<string, unknown>[];
  members: Profile[];
  verticals: Vertical[];
  profile: Profile;
  userId: string;
}

const STATUSES = ["draft", "pitched", "negotiation", "approved", "lost", "completed"] as const;
const STATUS_META: Record<string, { label: string; color: string; dot: string; revenueStage?: boolean }> = {
  draft:       { label: "Draft",       color: "bg-slate-100 text-slate-500",    dot: "bg-slate-300" },
  pitched:     { label: "Pitched",     color: "bg-blue-100 text-blue-700",      dot: "bg-blue-400" },
  negotiation: { label: "Negotiation", color: "bg-amber-100 text-amber-700",    dot: "bg-amber-400" },
  approved:    { label: "Approved",    color: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-500", revenueStage: true },
  lost:        { label: "Lost",        color: "bg-red-100 text-red-600",        dot: "bg-red-400" },
  completed:   { label: "Completed",   color: "bg-violet-100 text-violet-700",  dot: "bg-violet-500", revenueStage: true },
};

const BRIEF_STATUSES = ["draft", "planning", "approved", "live", "completed", "lost"] as const;
const BRIEF_STATUS_META: Record<string, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "bg-slate-100 text-slate-600" },
  planning:  { label: "Planning",  color: "bg-blue-100 text-blue-700" },
  approved:  { label: "Approved",  color: "bg-violet-100 text-violet-700" },
  live:      { label: "Live",      color: "bg-amber-100 text-amber-700" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700" },
  lost:      { label: "Lost",      color: "bg-red-100 text-red-600" },
};

type FormState = {
  company_name: string; contact_name: string; contact_email: string; contact_phone: string;
  status: Lead["status"]; our_poc_id: string; vertical_id: string; location: string;
  deal_value: string; engagement_type: "retainer" | "one_time"; monthly_value: string;
  deal_month: string; latest_update: string; notes: string; next_follow_up: string;
};

const EMPTY_LEAD: FormState = {
  company_name: "", contact_name: "", contact_email: "", contact_phone: "",
  status: "draft", our_poc_id: "", vertical_id: "", location: "",
  deal_value: "", engagement_type: "one_time", monthly_value: "", deal_month: "",
  latest_update: "", notes: "", next_follow_up: "",
};

type PipelineRow = { kind: "lead"; data: Lead } | { kind: "brief"; data: Record<string, unknown> };

function fmtL(n: number) {
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ─── Analytics Panel ────────────────────────────────────────────────────────

interface AnalyticsData {
  leads: Lead[];
  briefs: Record<string, unknown>[];
  verticals: Vertical[];
  members: Profile[];
}

function AnalyticsPanel({ data, onClose }: { data: AnalyticsData; onClose: () => void }) {
  const { leads, briefs, verticals, members } = data;

  // Revenue by month (last 6 months from today)
  const monthlyRevenue = useMemo(() => {
    const months: { key: string; label: string; approved: number; won: number; pipeline: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

      const approvedLeads = leads.filter(l => l.deal_month?.startsWith(key.slice(0, 7)) && l.status === "approved");
      const wonLeads = leads.filter(l => l.deal_month?.startsWith(key.slice(0, 7)) && l.status === "completed");
      const pipeLeads = leads.filter(l => l.deal_month?.startsWith(key.slice(0, 7)) && !["lost", "completed", "approved"].includes(l.status));

      const approvedBriefs = briefs.filter(b => {
        const created = String(b.created_at || "").slice(0, 7);
        return created === key.slice(0, 7) && ["approved", "completed", "live"].includes(String(b.status || ""));
      });

      months.push({
        key,
        label,
        approved: approvedLeads.reduce((s, l) => s + (l.deal_value || 0), 0) +
                  approvedBriefs.reduce((s, b) => s + (Number(b.total_budget) || 0), 0),
        won: wonLeads.reduce((s, l) => s + (l.deal_value || 0), 0),
        pipeline: pipeLeads.reduce((s, l) => s + (l.deal_value || 0), 0),
      });
    }
    return months;
  }, [leads, briefs]);

  const maxRev = Math.max(...monthlyRevenue.map(m => Math.max(m.approved, m.pipeline)), 1);

  // Funnel stage counts (leads only)
  const funnelStages = ["draft", "pitched", "negotiation", "approved", "lost", "completed"];
  const stageCounts = funnelStages.map(s => ({
    stage: s,
    label: STATUS_META[s].label,
    count: leads.filter(l => l.status === s).length,
    value: leads.filter(l => l.status === s).reduce((sum, l) => sum + (l.deal_value || 0), 0),
  }));

  // Industry breakdown (by vertical)
  const byVertical = verticals.map(v => {
    const vLeads = leads.filter(l => l.vertical_id === v.id);
    const vBriefs = briefs.filter(b => String(b.vertical_id || "") === v.id);
    const value = vLeads.reduce((s, l) => s + (l.deal_value || 0), 0) + vBriefs.reduce((s, b) => s + (Number(b.total_budget) || 0), 0);
    return { name: v.name, icon: v.icon, color: v.color, count: vLeads.length + vBriefs.length, value };
  }).filter(v => v.count > 0).sort((a, b) => b.value - a.value);

  // Retainer vs one-time
  const retainerLeads = leads.filter(l => l.engagement_type === "retainer" && l.status === "approved");
  const onetimeLeads = leads.filter(l => l.engagement_type !== "retainer" && l.status === "approved");
  const retainerMRR = retainerLeads.reduce((s, l) => s + (l.monthly_value || 0), 0);
  const onetimeValue = onetimeLeads.reduce((s, l) => s + (l.deal_value || 0), 0);

  // Stuck leads (in same status, not updated in 14+ days, not won/lost)
  const stuckLeads = leads.filter(l => {
    if (["approved", "lost", "completed"].includes(l.status)) return false;
    const daysSince = (Date.now() - new Date(l.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= 14;
  }).sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());

  // POC performance
  const byPoc = members.map(m => {
    const mLeads = leads.filter(l => l.our_poc_id === m.id);
    const won = mLeads.filter(l => ["approved", "won"].includes(l.status));
    return {
      name: m.full_name,
      total: mLeads.length,
      won: won.length,
      value: won.reduce((s, l) => s + (l.deal_value || 0), 0),
      rate: mLeads.length ? Math.round((won.length / mLeads.length) * 100) : 0,
    };
  }).filter(p => p.total > 0).sort((a, b) => b.value - a.value);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-end">
      <div className="bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-violet-600">
          <div>
            <h2 className="text-lg font-bold text-white">Revenue Analytics</h2>
            <p className="text-xs text-indigo-200">Pipeline intelligence & movement analysis</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Monthly Revenue Chart */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-semibold text-slate-800 mb-1">Monthly Revenue Movement</h3>
            <p className="text-xs text-slate-400 mb-4">Approved + won deal value attributed to deal month</p>
            <div className="flex items-end gap-3 h-36">
              {monthlyRevenue.map(m => (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: 112 }}>
                    {m.pipeline > 0 && (
                      <div
                        className="w-full bg-slate-200 rounded-t opacity-60"
                        style={{ height: `${Math.round((m.pipeline / maxRev) * 80)}px`, minHeight: 2 }}
                        title={`Pipeline: ${fmtL(m.pipeline)}`}
                      />
                    )}
                    {m.approved > 0 && (
                      <div
                        className="w-full bg-indigo-500 rounded-t"
                        style={{ height: `${Math.round((m.approved / maxRev) * 80)}px`, minHeight: 2 }}
                        title={`Approved: ${fmtL(m.approved)}`}
                      />
                    )}
                    {m.approved === 0 && m.pipeline === 0 && (
                      <div className="w-full bg-slate-100 rounded-t" style={{ height: 4 }} />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">{m.label}</span>
                  {m.approved > 0 && <span className="text-[9px] text-indigo-600 font-semibold">{fmtL(m.approved)}</span>}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" /> Approved / Won</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-200 inline-block" /> Active Pipeline</span>
            </div>
          </div>

          {/* Retainer vs One-time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Repeat2 className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold text-violet-800">Retainer Business</span>
              </div>
              <p className="text-2xl font-bold text-violet-700">{fmtL(retainerMRR)}<span className="text-sm font-normal">/mo</span></p>
              <p className="text-xs text-violet-500 mt-1">{retainerLeads.length} active retainer{retainerLeads.length !== 1 ? "s" : ""}</p>
              <p className="text-xs text-violet-400 mt-0.5">Annual: {fmtL(retainerMRR * 12)}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-800">One-time Business</span>
              </div>
              <p className="text-2xl font-bold text-emerald-700">{fmtL(onetimeValue)}</p>
              <p className="text-xs text-emerald-500 mt-1">{onetimeLeads.length} deal{onetimeLeads.length !== 1 ? "s" : ""} closed</p>
            </div>
          </div>

          {/* Pipeline Funnel */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Pipeline Funnel</h3>
            <div className="space-y-2">
              {stageCounts.map((s, i) => {
                const maxCount = Math.max(...stageCounts.map(s => s.count), 1);
                const prev = i > 0 ? stageCounts[i - 1].count : null;
                const dropPct = prev && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;
                return (
                  <div key={s.stage}>
                    {dropPct !== null && dropPct > 0 && (
                      <div className="flex items-center gap-1 text-xs text-slate-400 py-0.5 pl-2">
                        <ArrowRight className="w-3 h-3" />
                        <span>{dropPct}% drop-off</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-20 text-xs font-medium text-slate-600 text-right shrink-0">{s.label}</div>
                      <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden">
                        <div
                          className={`h-full rounded-lg flex items-center px-2 transition-all ${s.stage === "approved" || s.stage === "won" ? "bg-indigo-500" : "bg-slate-300"}`}
                          style={{ width: `${Math.max((s.count / maxCount) * 100, s.count > 0 ? 4 : 0)}%` }}
                        >
                          {s.count > 0 && <span className="text-xs font-semibold text-white">{s.count}</span>}
                        </div>
                      </div>
                      <div className="w-20 text-xs text-slate-500 shrink-0">{s.value > 0 ? fmtL(s.value) : "—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Industry / Vertical Breakdown */}
          {byVertical.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-semibold text-slate-800 mb-4">By Industry / Vertical</h3>
              <div className="space-y-2.5">
                {byVertical.map(v => {
                  const maxVal = Math.max(...byVertical.map(x => x.value), 1);
                  return (
                    <div key={v.name} className="flex items-center gap-3">
                      <div className="w-28 flex items-center gap-1.5 shrink-0">
                        <span>{v.icon}</span>
                        <span className="text-xs font-medium text-slate-700 truncate">{v.name}</span>
                      </div>
                      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max((v.value / maxVal) * 100, v.count > 0 ? 3 : 0)}%`,
                            backgroundColor: v.color,
                          }}
                        />
                      </div>
                      <div className="w-16 text-xs text-slate-600 font-medium text-right">{fmtL(v.value)}</div>
                      <div className="w-10 text-xs text-slate-400 text-right">{v.count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stuck Leads */}
          {stuckLeads.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="font-semibold text-amber-800">Stuck in Pipeline ({stuckLeads.length})</h3>
              </div>
              <p className="text-xs text-amber-600 mb-3">Leads with no status update in 14+ days</p>
              <div className="space-y-2">
                {stuckLeads.slice(0, 8).map(l => {
                  const daysSince = Math.floor((Date.now() - new Date(l.updated_at).getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={l.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{l.company_name}</p>
                        <p className="text-xs text-slate-400">{STATUS_META[l.status]?.label} · {l.deal_value ? fmtL(l.deal_value) : "No value"}</p>
                      </div>
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{daysSince}d stale</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* POC Performance */}
          {byPoc.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Team Performance</h3>
              <div className="space-y-3">
                {byPoc.map(p => (
                  <div key={p.name} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium text-slate-800">{p.name}</span>
                        <span className="text-xs text-slate-500">{p.won}/{p.total} closed · {p.rate}% win rate</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${p.rate}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-indigo-700 w-16 text-right">{fmtL(p.value)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PipelineClient({ initialLeads, initialBriefs, members, verticals, profile, userId }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [briefs, setBriefs] = useState<Record<string, unknown>[]>(initialBriefs);
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterVertical, setFilterVertical] = useState<string>("");
  const [filterPoc, setFilterPoc] = useState<string>("");
  const [filterType, setFilterType] = useState<"all" | "leads" | "briefs">("all");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterEngagement, setFilterEngagement] = useState<string>("");
  const supabase = createClient();
  const router = useRouter();

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    // Revenue is counted ONLY at "approved" stage
    const approvedLeads = leads.filter(l => l.status === "approved");
    const activeLeads = leads.filter(l => !["approved", "lost", "completed"].includes(l.status));
    const retainerLeads = leads.filter(l => l.engagement_type === "retainer" && l.status === "approved");

    const approvedBriefs = briefs.filter(b => ["approved", "live", "completed"].includes(String(b.status || "")));

    const totalPipeline = activeLeads.reduce((s, l) => s + (l.deal_value || 0), 0);
    const approvedRevenue = approvedLeads.reduce((s, l) => s + (l.deal_value || 0), 0)
      + approvedBriefs.reduce((s, b) => s + (Number(b.total_budget) || 0), 0);
    const retainerMRR = retainerLeads.reduce((s, l) => s + (l.monthly_value || 0), 0);

    const thisMonth = currentMonthStr().slice(0, 7);
    const thisMonthApproved = approvedLeads
      .filter(l => l.deal_month?.startsWith(thisMonth) || l.updated_at.startsWith(thisMonth))
      .reduce((s, l) => s + (l.deal_value || 0), 0);

    const qualifiedLeads = leads.filter(l => l.status !== "draft");
    return {
      activePipeline: totalPipeline,
      approvedRevenue,
      retainerMRR,
      activeCount: activeLeads.length,
      approvedCount: approvedLeads.length,
      thisMonthApproved,
      winRate: qualifiedLeads.length > 0 ? Math.round((approvedLeads.length / qualifiedLeads.length) * 100) : 0,
    };
  }, [leads, briefs]);

  // Funnel counts (leads only, for the mini strip)
  const funnelCounts = useMemo(() => {
    return STATUSES.map(s => ({ stage: s, count: leads.filter(l => l.status === s).length }));
  }, [leads]);

  // Available months (for filter)
  const availableMonths = useMemo(() => {
    const seen = new Set<string>();
    leads.forEach(l => { if (l.deal_month) seen.add(l.deal_month.slice(0, 7)); });
    return Array.from(seen).sort().reverse();
  }, [leads]);

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const rows = useMemo((): PipelineRow[] => {
    const leadRows: PipelineRow[] = leads.map(l => ({ kind: "lead", data: l }));
    const briefRows: PipelineRow[] = briefs.map(b => ({ kind: "brief", data: b }));
    return [...leadRows, ...briefRows].filter(row => {
      const name = row.kind === "lead" ? row.data.company_name : String(row.data.brand_name || "");
      const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === "all" || (filterType === "leads" && row.kind === "lead") || (filterType === "briefs" && row.kind === "brief");
      const matchStatus = !filterStatus || (row.kind === "lead" && row.data.status === filterStatus)
        || (row.kind === "brief" && String(row.data.status || "") === filterStatus);
      const matchVertical = !filterVertical || (row.kind === "lead"
        ? row.data.vertical_id === filterVertical
        : String(row.data.vertical_id || "") === filterVertical);
      const matchPoc = !filterPoc || (row.kind === "lead" && row.data.our_poc_id === filterPoc);
      const matchMonth = !filterMonth || (row.kind === "lead" && row.data.deal_month?.startsWith(filterMonth));
      const matchEngagement = !filterEngagement || (row.kind === "lead" && (row.data.engagement_type || "one_time") === filterEngagement);
      return matchSearch && matchType && matchStatus && matchVertical && matchPoc && matchMonth && matchEngagement;
    });
  }, [leads, briefs, search, filterType, filterStatus, filterVertical, filterPoc, filterMonth, filterEngagement]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function updateBriefStatus(briefId: string, status: string) {
    await supabase.from("client_briefs").update({ status }).eq("id", briefId);
    setBriefs(prev => prev.map(b => String(b.id) === briefId ? { ...b, status } : b));
    if (status === "completed") router.push(`/dashboard/results?brief=${briefId}`);
  }

  function openAdd() {
    setForm({ ...EMPTY_LEAD, our_poc_id: userId, vertical_id: verticals[0]?.id || "", deal_month: currentMonthStr() });
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
      engagement_type: lead.engagement_type || "one_time",
      monthly_value: lead.monthly_value?.toString() || "",
      deal_month: lead.deal_month ? lead.deal_month.slice(0, 10) : "",
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
      engagement_type: form.engagement_type,
      monthly_value: form.monthly_value ? parseFloat(form.monthly_value) : null,
      deal_month: form.deal_month || null,
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
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    // Record approval timestamp once — never overwrite it if already set
    if (status === "approved" && !lead.approved_at) {
      patch.approved_at = new Date().toISOString();
    }
    const { data } = await supabase.from("leads")
      .update(patch)
      .eq("id", lead.id)
      .select("*, our_poc:profiles!leads_our_poc_id_fkey(full_name, email), vertical:verticals(name, color)")
      .single();
    if (data) {
      setLeads(leads.map(l => l.id === lead.id ? data as Lead : l));
      if (status === "approved") {
        await supabase.from("clients").upsert({
          lead_id: lead.id,
          name: lead.company_name,
          contact_name: lead.contact_name,
          contact_email: lead.contact_email || null,
          contact_phone: lead.contact_phone || null,
          engagement_type: lead.engagement_type === "retainer" ? "retainer" : "one_time",
          amount: lead.deal_value || 0,
          monthly_value: lead.monthly_value || 0,
          deliverables: lead.notes || "",
          vertical_id: lead.vertical_id || null,
          status: "active",
          updated_at: new Date().toISOString(),
        }, { onConflict: "lead_id" });
      }
    }
  }

  function openBriefInDistro(briefId: string) {
    router.push(`/dashboard/distro?brief=${briefId}`);
  }

  const hasFilters = !!(search || filterStatus || filterVertical || filterPoc || filterType !== "all" || filterMonth || filterEngagement);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-sm shadow-indigo-200">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Sales Pipeline</h1>
              <p className="text-xs text-slate-400">All leads, briefs & revenue in one view</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAnalytics(true)}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm">
              <BarChart2 className="w-4 h-4 text-indigo-500" /> Analytics
            </button>
            <button onClick={openAdd}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200">
              <Plus className="w-4 h-4" /> Add Lead
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-slate-500 mb-1">Active Pipeline</p>
            <p className="text-xl font-bold text-slate-800">{fmtL(stats.activePipeline)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{stats.activeCount} open leads</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-emerald-600 mb-1">Approved Revenue</p>
            <p className="text-xl font-bold text-emerald-800">{fmtL(stats.approvedRevenue)}</p>
            <p className="text-xs text-emerald-400 mt-0.5">{stats.approvedCount} deal{stats.approvedCount !== 1 ? "s" : ""} approved</p>
          </div>
          <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-violet-600 mb-1">Retainer MRR</p>
            <p className="text-xl font-bold text-violet-800">{fmtL(stats.retainerMRR)}</p>
            <p className="text-xs text-violet-400 mt-0.5">{fmtL(stats.retainerMRR * 12)} ARR</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-indigo-600 mb-1">This Month</p>
            <p className="text-xl font-bold text-indigo-800">{fmtL(stats.thisMonthApproved)}</p>
            <p className="text-xs text-indigo-400 mt-0.5">Approved this month</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-amber-600 mb-1">Win Rate</p>
            <p className="text-xl font-bold text-amber-800">{stats.winRate || 0}%</p>
            <p className="text-xs text-amber-400 mt-0.5">Of qualified leads</p>
          </div>
        </div>

        {/* Mini Funnel Strip */}
        <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
          {funnelCounts.map((f, i, arr) => (
            <div key={f.stage} className="flex items-center gap-1">
              <button
                onClick={() => setFilterStatus(filterStatus === f.stage ? "" : f.stage)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap border ${
                  filterStatus === f.stage
                    ? `${STATUS_META[f.stage]?.color} border-current`
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[f.stage]?.dot}`} />
                {STATUS_META[f.stage]?.label}
                <span className="ml-0.5 font-bold">{f.count}</span>
              </button>
              {i < arr.length - 1 && !["lost", "completed"].includes(f.stage) && (
                <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search company, client…"
            className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
        </div>
        <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
          {(["all", "leads", "briefs"] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${filterType === t ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {t === "all" ? "All" : t === "leads" ? "Leads" : "Briefs"}
            </button>
          ))}
        </div>

        <select value={filterEngagement} onChange={e => setFilterEngagement(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
          <option value="">All Types</option>
          <option value="retainer">Retainer</option>
          <option value="one_time">One-time</option>
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>

        <select value={filterVertical} onChange={e => setFilterVertical(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
          <option value="">All Verticals</option>
          {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
        </select>

        {availableMonths.length > 0 && (
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">All Months</option>
            {availableMonths.map(m => <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>)}
          </select>
        )}

        <select value={filterPoc} onChange={e => setFilterPoc(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
          <option value="">All POCs</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>

        {hasFilters && (
          <button onClick={() => { setSearch(""); setFilterStatus(""); setFilterVertical(""); setFilterPoc(""); setFilterType("all"); setFilterMonth(""); setFilterEngagement(""); }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 px-2 py-1.5 hover:bg-slate-100 rounded-lg">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{rows.length} entr{rows.length !== 1 ? "ies" : "y"}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 sticky left-0 bg-slate-50 z-20 w-24">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 sticky left-24 bg-slate-50 z-20 min-w-[180px]">Company / Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Vertical</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Engagement</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">POC</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Value</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Month</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Follow-up</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 sticky right-0 bg-slate-50 z-20 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-16 text-slate-400">
                      <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">No entries found</p>
                      <p className="text-xs mt-1">{hasFilters ? "Try clearing filters" : "Add a lead or create a campaign brief"}</p>
                    </td>
                  </tr>
                )}
                {rows.map((row, idx) => {
                  if (row.kind === "lead") {
                    const lead = row.data;
                    const vertical = verticals.find(v => v.id === lead.vertical_id);
                    const linkedBrief = lead.brief_id ? briefs.find(b => String(b.id) === lead.brief_id) : null;
                    const briefIsComplete = linkedBrief && ["completed", "live"].includes(String(linkedBrief.status || ""));
                    const briefHasPlan = linkedBrief && Boolean(linkedBrief.media_plan_json);
                    const isRevenue = lead.status === "approved";
                    const isRetainer = lead.engagement_type === "retainer";

                    return (
                      <tr key={`lead-${lead.id}`} className={`hover:bg-slate-50 transition-colors group ${isRevenue ? "bg-emerald-50/20" : ""}`}>
                        <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium w-fit">Lead</span>
                            {isRetainer
                              ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium w-fit flex items-center gap-0.5"><Repeat2 className="w-2.5 h-2.5" />Retainer</span>
                              : <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 font-medium w-fit flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />One-time</span>
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3 sticky left-24 bg-white group-hover:bg-slate-50 z-10">
                          <p className="font-semibold text-slate-900 text-sm">{lead.company_name}</p>
                          {lead.location && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              <span className="text-xs text-slate-400">{lead.location}</span>
                            </div>
                          )}
                          {lead.latest_update && (
                            <p className="text-xs text-slate-400 mt-0.5 max-w-40 truncate" title={lead.latest_update}>{lead.latest_update}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-700">{lead.contact_name}</p>
                          {lead.contact_email && <p className="text-xs text-slate-400">{lead.contact_email}</p>}
                          {lead.contact_phone && <p className="text-xs text-slate-400">{lead.contact_phone}</p>}
                        </td>
                        <td className="px-4 py-3">
                          {vertical && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                              style={{ backgroundColor: `${vertical.color}20`, color: vertical.color }}>
                              {vertical.icon} {vertical.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isRetainer && lead.monthly_value ? (
                            <div>
                              <span className="text-xs font-semibold text-violet-700">{fmtL(lead.monthly_value)}/mo</span>
                              <p className="text-xs text-slate-400">{fmtL(lead.monthly_value * 12)}/yr</p>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={lead.status}
                            onChange={e => updateStatus(lead, e.target.value as Lead["status"])}
                            className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${STATUS_META[lead.status]?.color}`}>
                            {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {(lead.our_poc as Profile)?.full_name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-800 font-semibold">{lead.deal_value ? fmtL(lead.deal_value) : "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          {lead.deal_month ? (
                            <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {monthLabel(lead.deal_month)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {lead.next_follow_up ? (
                            <span className={`text-xs font-medium ${new Date(lead.next_follow_up) < new Date() ? "text-red-500" : "text-slate-600"}`}>
                              {formatDate(lead.next_follow_up)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 sticky right-0 bg-white group-hover:bg-slate-50 z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center gap-1">
                            {linkedBrief ? (
                              <>
                                <button onClick={() => openBriefInDistro(String(linkedBrief.id))}
                                  className="flex items-center gap-1 text-xs px-2.5 py-1 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium whitespace-nowrap">
                                  <ExternalLink className="w-3 h-3" /> Brief
                                </button>
                                {!briefIsComplete && briefHasPlan && (
                                  <button onClick={async () => {
                                    await supabase.from("client_briefs").update({ status: "completed" }).eq("id", String(linkedBrief.id));
                                    setBriefs(p => p.map(b => String(b.id) === String(linkedBrief.id) ? { ...b, status: "completed" } : b));
                                    router.push(`/dashboard/results?brief=${linkedBrief.id}`);
                                  }}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium whitespace-nowrap">
                                    <CheckCircle2 className="w-3 h-3" /> Complete
                                  </button>
                                )}
                                {briefIsComplete && (
                                  <button onClick={() => router.push(`/dashboard/results?brief=${linkedBrief.id}`)}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium whitespace-nowrap">
                                    <CheckCircle2 className="w-3 h-3" /> Results
                                  </button>
                                )}
                              </>
                            ) : (
                              <button onClick={() => {
                                const prefill = encodeURIComponent(JSON.stringify({
                                  brand_name: lead.company_name, poc_name: lead.contact_name,
                                  total_budget: lead.deal_value?.toString() || "",
                                  target_geography: lead.location || "",
                                  additional_notes: lead.notes || "", lead_id: lead.id,
                                }));
                                router.push(`/dashboard/distro?prefill=${prefill}`);
                              }}
                                className="flex items-center gap-1 text-xs px-2.5 py-1 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-medium whitespace-nowrap">
                                <ExternalLink className="w-3 h-3" /> Brief
                              </button>
                            )}
                            <button onClick={() => openEdit(lead)} className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors" title="Edit">
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

                  // ── Brief row ───────────────────────────────────────────────
                  const brief = row.data;
                  const creator = (brief.creator as Record<string, unknown>) || null;
                  const briefStatus = String(brief.status || "draft");
                  const statusMeta = BRIEF_STATUS_META[briefStatus] || BRIEF_STATUS_META.draft;
                  return (
                    <tr key={`brief-${brief.id}`} className="hover:bg-violet-50/20 transition-colors group">
                      <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-violet-50/20 z-10">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium flex items-center gap-1 w-fit">
                          <FileText className="w-3 h-3" /> Brief
                        </span>
                      </td>
                      <td className="px-4 py-3 sticky left-24 bg-white group-hover:bg-violet-50/20 z-10">
                        <p className="font-semibold text-slate-900 text-sm">{String(brief.brand_name || "—")}</p>
                        <p className="text-xs text-slate-400 capitalize">{String(brief.campaign_type || "")}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-600">{String(brief.industry || "—")}</p>
                        {Boolean(brief.target_audience) && (
                          <p className="text-xs text-slate-400 max-w-36 truncate">{String(brief.target_audience)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-400">—</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-400">—</span>
                      </td>
                      <td className="px-4 py-3">
                        <select value={briefStatus} onChange={e => updateBriefStatus(String(brief.id), e.target.value)}
                          className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${statusMeta.color}`}>
                          {BRIEF_STATUSES.map(s => <option key={s} value={s}>{BRIEF_STATUS_META[s]?.label || s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {String(creator?.full_name || "—")}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">
                          {brief.total_budget ? fmtL(Number(brief.total_budget)) : "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs flex items-center gap-1 text-slate-500">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {new Date(String(brief.created_at || "")).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-300">—</span>
                      </td>
                      <td className="px-4 py-3 sticky right-0 bg-white group-hover:bg-violet-50/20 z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => openBriefInDistro(String(brief.id))}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-medium whitespace-nowrap">
                            <ExternalLink className="w-3 h-3" /> Open
                          </button>
                          {briefStatus !== "completed" && Boolean(brief.media_plan_json) && (
                            <button onClick={async () => {
                              await supabase.from("client_briefs").update({ status: "completed" }).eq("id", String(brief.id));
                              setBriefs(p => p.map(b => String(b.id) === String(brief.id) ? { ...b, status: "completed" } : b));
                              router.push(`/dashboard/results?brief=${brief.id}`);
                            }}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3" /> Complete
                            </button>
                          )}
                          {briefStatus === "completed" && (
                            <button onClick={() => router.push(`/dashboard/results?brief=${brief.id}`)}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3" /> Results
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
      </div>

      {/* Analytics Panel */}
      {showAnalytics && (
        <AnalyticsPanel
          data={{ leads, briefs, verticals, members }}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {/* Add / Edit Lead Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-slate-900">{editingLead ? "Edit Lead" : "Add New Lead"}</h3>
                <p className="text-xs text-slate-400 mt-0.5">All revenue-committed leads appear in pipeline stats</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {/* Company */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Company Name *</label>
                <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })}
                  placeholder="e.g. Reliance Brands"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contact Name *</label>
                <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })}
                  placeholder="Client POC name"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contact Email</label>
                <input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="poc@company.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contact Phone</label>
                <input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="City / Region"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {/* Engagement Type */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Engagement Type</label>
                <div className="flex gap-3">
                  {(["one_time", "retainer"] as const).map(type => (
                    <button key={type} type="button" onClick={() => setForm({ ...form, engagement_type: type })}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                        form.engagement_type === type
                          ? type === "retainer" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}>
                      {type === "retainer" ? <Repeat2 className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      {type === "retainer" ? "Retainer (Recurring)" : "One-time Project"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {form.engagement_type === "retainer" ? "Total Contract Value (₹)" : "Deal Value (₹)"}
                </label>
                <input type="number" value={form.deal_value} onChange={e => setForm({ ...form, deal_value: e.target.value })}
                  placeholder="500000"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {form.engagement_type === "retainer" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Monthly Retainer Value (₹)</label>
                  <input type="number" value={form.monthly_value} onChange={e => setForm({ ...form, monthly_value: e.target.value })}
                    placeholder="50000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Deal Month</label>
                <input type="month" value={form.deal_month ? form.deal_month.slice(0, 7) : ""}
                  onChange={e => setForm({ ...form, deal_month: e.target.value ? e.target.value + "-01" : "" })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <p className="text-xs text-slate-400 mt-1">Which month does this deal pertain to?</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Vertical</label>
                <select value={form.vertical_id} onChange={e => setForm({ ...form, vertical_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Lead["status"] })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Our POC</label>
                <select value={form.our_poc_id} onChange={e => setForm({ ...form, our_poc_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select POC</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Next Follow-up</label>
                <input type="datetime-local" value={form.next_follow_up} onChange={e => setForm({ ...form, next_follow_up: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Latest Update</label>
                <input value={form.latest_update} onChange={e => setForm({ ...form, latest_update: e.target.value })}
                  placeholder="What's the latest on this lead?"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional context, requirements, history…" rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100 sticky bottom-0 bg-white">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                Cancel
              </button>
              <button onClick={saveLead} disabled={saving || !form.company_name.trim() || !form.contact_name.trim()}
                className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : editingLead ? "Update Lead" : "Add Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
