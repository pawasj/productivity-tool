"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  Users2, Plus, X, Search, Pencil, Trash2, Building2, Phone, Mail,
  CreditCard, FileText, Loader2, RefreshCw, UserCircle, TrendingUp,
  TrendingDown, CheckSquare, ChevronDown, ChevronUp, IndianRupee, Tag,
  Calendar, Repeat, Ban,
} from "lucide-react";
import type { Client, Vertical, Profile } from "@/lib/types";
import MonthPicker from "@/components/ui/MonthPicker";

const OFFERINGS = [
  "Social Media", "SEO", "Design", "Performance Marketing",
  "Video Editing", "Video Shoot", "GEO / AEO",
];

interface Offering {
  service: string;
  in_house: boolean;
  responsible_type: "member" | "vendor" | "intern" | "";
  responsible_id: string;
  responsible_name: string;
  outsource_cost: number;
}

interface ExtClient extends Client {
  /** Paid out to creators / pages for placements — a direct cost of delivery */
  distribution_payout?: number;
  poc_name?: string;
  poc_role?: string;
  poc_phone?: string;
  poc_email?: string;
  team_member_ids?: string[];
  offerings?: Offering[];
}

interface VendorRow { id: string; name: string; type: string; service_type?: string; rate?: number }

interface Props {
  verticals: Vertical[];
  members: Profile[];
  vendors: VendorRow[];
  userId: string;
  isAdmin: boolean;
}

const EMPTY: Omit<ExtClient, "id" | "created_at" | "updated_at" | "vertical"> = {
  name: "", office_address: "", gst_number: "", contact_name: "",
  contact_phone: "", contact_email: "", engagement_type: "one_time",
  amount: 0, monthly_value: 0, deliverables: "", vertical_id: "",
  status: "active", notes: "",
  start_month: "", end_month: "", distribution_payout: 0,
  poc_name: "", poc_role: "", poc_phone: "", poc_email: "",
  team_member_ids: [], offerings: [],
};

function fmt(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
function monthLabel(ym: string) {
  return new Date(ym + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
function thisMonth() { return new Date().toISOString().slice(0, 7); }

/**
 * Is this client billable in the given month?
 *  · retainer  — runs from start_month until end_month (inclusive); an unset
 *                end_month means it is still running, so it keeps counting
 *  · one-time  — only ever counts in the month the deal was approved
 * String comparison is safe here because YYYY-MM sorts chronologically.
 */
function activeInMonth(c: ExtClient, month: string): boolean {
  const start = c.start_month || (c.created_at || "").slice(0, 7);
  if (!start) return true;                 // undated legacy row — never hide it
  if (start > month) return false;         // engagement had not begun yet
  if (c.engagement_type === "retainer") {
    return !c.end_month || month <= c.end_month;
  }
  return start === month;                  // one-time
}

export default function ClientsClient({ verticals, members, vendors, userId, isAdmin }: Props) {
  const [clients, setClients] = useState<ExtClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterVertical, setFilterVertical] = useState("");
  const [month, setMonth] = useState(thisMonth);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExtClient | null>(null);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ExtClient | null>(null);
  // Salary data for profitability: member_id → monthly salary
  const [memberSalaries, setMemberSalaries] = useState<Record<string, number>>({});
  // client counts per in-house member across all clients
  const [memberClientCounts, setMemberClientCounts] = useState<Record<string, number>>({});
  // offering section collapse
  const [offeringOpen, setOfferingOpen] = useState(false);
  // custom offering input
  const [customOffering, setCustomOffering] = useState("");
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clients")
      .select("*, vertical:verticals(id,name,color)")
      .order("updated_at", { ascending: false });
    const rows = (data || []) as ExtClient[];
    setClients(rows);

    // Build member→salary map from current month's salary_entries
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const { data: salaries } = await supabase
      .from("salary_entries")
      .select("member_id, amount")
      .eq("month", month)
      .not("member_id", "is", null);
    const salMap: Record<string, number> = {};
    for (const s of salaries || []) {
      if (s.member_id) salMap[s.member_id] = (salMap[s.member_id] || 0) + s.amount;
    }
    setMemberSalaries(salMap);

    // Count how many clients each member handles in-house across all clients
    const counts: Record<string, number> = {};
    for (const c of rows) {
      for (const o of c.offerings || []) {
        if (o.in_house && o.responsible_id) {
          counts[o.responsible_id] = (counts[o.responsible_id] || 0) + 1;
        }
      }
    }
    setMemberClientCounts(counts);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function sf(k: string, v: unknown) { setForm(f => ({ ...f, [k]: v })); }

  function openNew() {
    setForm({ ...EMPTY, start_month: month });
    setEditing(null); setShowForm(true); setOfferingOpen(false); setCustomOffering("");
  }
  function openEdit(c: ExtClient) {
    setForm({
      name: c.name, office_address: c.office_address || "",
      gst_number: c.gst_number || "", contact_name: c.contact_name || "",
      contact_phone: c.contact_phone || "", contact_email: c.contact_email || "",
      engagement_type: c.engagement_type || "one_time",
      amount: c.amount || 0, monthly_value: c.monthly_value || 0,
      deliverables: c.deliverables || "", vertical_id: c.vertical_id || "",
      status: c.status || "active", notes: c.notes || "",
      start_month: c.start_month || (c.created_at || "").slice(0, 7),
      end_month: c.end_month || "",
      distribution_payout: c.distribution_payout || 0,
      poc_name: c.poc_name || "", poc_role: c.poc_role || "",
      poc_phone: c.poc_phone || "", poc_email: c.poc_email || "",
      team_member_ids: c.team_member_ids || [],
      offerings: c.offerings || [],
    });
    setEditing(c); setShowForm(true); setOfferingOpen(false); setCustomOffering("");
  }

  function toggleOffering(service: string) {
    const cur = form.offerings || [];
    const exists = cur.find(o => o.service === service);
    if (exists) {
      sf("offerings", cur.filter(o => o.service !== service));
    } else {
      sf("offerings", [...cur, { service, in_house: true, responsible_type: "", responsible_id: "", responsible_name: "", outsource_cost: 0 }]);
    }
  }

  function updateOffering(service: string, patch: Partial<Offering>) {
    sf("offerings", (form.offerings || []).map(o => o.service === service ? { ...o, ...patch } : o));
  }

  function addCustomOffering() {
    const s = customOffering.trim();
    if (!s) return;
    const cur = form.offerings || [];
    if (!cur.find(o => o.service === s)) {
      sf("offerings", [...cur, { service: s, in_house: true, responsible_type: "", responsible_id: "", responsible_name: "", outsource_cost: 0 }]);
    }
    setCustomOffering("");
  }

  function toggleTeamMember(id: string) {
    const cur = form.team_member_ids || [];
    sf("team_member_ids", cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name, office_address: form.office_address, gst_number: form.gst_number,
      contact_name: form.contact_name, contact_phone: form.contact_phone, contact_email: form.contact_email,
      engagement_type: form.engagement_type,
      // Only admins may set/change client value — non-admin saves leave it untouched
      ...(isAdmin ? {
        amount: Number(form.amount) || 0,
        monthly_value: Number(form.monthly_value) || 0,
        distribution_payout: Number(form.distribution_payout) || 0,
      } : {}),
      deliverables: form.deliverables, vertical_id: form.vertical_id || null,
      status: form.status, notes: form.notes,
      start_month: form.start_month || thisMonth(),
      // Retainers only — a one-time deal has no run-length to end
      end_month: form.engagement_type === "retainer" ? (form.end_month || null) : null,
      poc_name: form.poc_name || null, poc_role: form.poc_role || null,
      poc_phone: form.poc_phone || null, poc_email: form.poc_email || null,
      team_member_ids: form.team_member_ids || [],
      offerings: form.offerings || [],
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      await supabase.from("clients").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("clients").insert({ ...payload, created_at: new Date().toISOString() });
    }
    setSaving(false); setShowForm(false); setEditing(null);
    load();
  }

  // Stop a retainer billing after the selected month, without deleting history
  async function discontinue(c: ExtClient) {
    if (!confirm(`Stop billing ${c.name} after ${monthLabel(month)}?\n\nThey stay on every month up to and including this one.`)) return;
    await supabase.from("clients")
      .update({ end_month: month, status: "discontinued", updated_at: new Date().toISOString() })
      .eq("id", c.id);
    load();
  }

  async function resume(c: ExtClient) {
    await supabase.from("clients")
      .update({ end_month: null, status: "active", updated_at: new Date().toISOString() })
      .eq("id", c.id);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this client?")) return;
    await supabase.from("clients").delete().eq("id", id);
    setClients(c => c.filter(x => x.id !== id));
    if (selectedClient?.id === id) setSelectedClient(null);
  }

  // Profitability for a client
  function calcProfitability(c: ExtClient) {
    const revenue = c.engagement_type === "retainer" ? (c.monthly_value || 0) : (c.amount || 0);
    let totalCost = 0;
    const breakdown: { service: string; cost: number; note: string }[] = [];

    for (const o of c.offerings || []) {
      if (o.in_house && o.responsible_id) {
        const sal = memberSalaries[o.responsible_id] || 0;
        const count = memberClientCounts[o.responsible_id] || 1;
        const allocated = count > 0 ? sal / count : 0;
        totalCost += allocated;
        breakdown.push({ service: o.service, cost: allocated, note: `${o.responsible_name} (${fmt(sal)}/mo ÷ ${count} clients)` });
      } else if (!o.in_house && o.outsource_cost) {
        totalCost += o.outsource_cost;
        breakdown.push({ service: o.service, cost: o.outsource_cost, note: `Outsourced — ${o.responsible_name || "vendor"}` });
      }
    }

    // Money paid straight out to creators / pages for placements
    const distribution = c.distribution_payout || 0;
    if (distribution > 0) {
      totalCost += distribution;
      breakdown.push({ service: "Distribution Payout", cost: distribution, note: "Creators / pages for placements" });
    }

    const profit = revenue - totalCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, totalCost, profit, margin, distribution, breakdown };
  }

  // Everything below is scoped to the selected month
  const monthClients = clients.filter(c => activeInMonth(c, month));

  const filtered = monthClients.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.name.toLowerCase().includes(q) || (c.contact_name || "").toLowerCase().includes(q);
    const matchV = !filterVertical || c.vertical_id === filterVertical;
    return matchQ && matchV;
  });

  const monthRetainers = monthClients.filter(c => c.engagement_type === "retainer");
  const monthOneTime = monthClients.filter(c => c.engagement_type !== "retainer");
  const totalMRR = monthRetainers.reduce((s, c) => s + (c.monthly_value || 0), 0);
  const totalRevenue = monthOneTime.reduce((s, c) => s + (c.amount || 0), 0);
  const isCurrentMonth = month === thisMonth();


  const interns = vendors.filter(v => v.type === "intern");
  const vendorList = vendors.filter(v => v.type === "vendor");

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center shadow-sm shadow-violet-200">
              <Users2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Client Details</h1>
              <p className="text-sm text-slate-400">
                Showing <span className="font-medium text-slate-600">{monthLabel(month)}</span>
                {" · "}retainers carry forward automatically until discontinued
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-slate-400" />
            <MonthPicker value={month} onChange={setMonth} accent="focus:ring-violet-500" />
            {!isCurrentMonth && (
              <button onClick={() => setMonth(thisMonth())}
                className="px-2.5 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg">
                This month
              </button>
            )}
            <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700">
              <Plus className="w-4 h-4" /> Add Client
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Clients This Month", value: monthClients.length as string | number, color: "text-violet-600" },
            { label: "Running Retainers", value: monthRetainers.length as string | number, color: "text-emerald-600" },
            ...(isAdmin ? [
              { label: "One-time Revenue", value: fmt(totalRevenue) as string | number, color: "text-blue-600" },
              { label: "Retainer Revenue", value: fmt(totalMRR) as string | number, color: "text-amber-600" },
              { label: "Total Revenue", value: fmt(totalRevenue + totalMRR) as string | number, color: "text-slate-900" },
            ] : []),
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`text-lg font-bold ${s.color} mt-0.5`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Client List */}
        <div className="flex flex-col w-full md:w-80 max-h-64 md:max-h-none border-b md:border-b-0 md:border-r border-slate-200 bg-white overflow-hidden shrink-0">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <select value={filterVertical} onChange={e => setFilterVertical(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">
              <option value="">All Verticals</option>
              {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                <Users2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                {clients.length === 0
                  ? "No clients yet."
                  : monthClients.length === 0
                    ? `No clients running in ${monthLabel(month)}.`
                    : "No matches"}
              </div>
            ) : filtered.map(c => {
              const { margin, profit } = calcProfitability(c);
              const hasOfferings = (c.offerings || []).length > 0;
              return (
                <button key={c.id} onClick={() => setSelectedClient(c)}
                  className={`w-full text-left p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedClient?.id === c.id ? "bg-violet-50 border-l-2 border-l-violet-500" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{c.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{c.poc_name || c.contact_name || "—"}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {c.vertical && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: `${c.vertical.color}20`, color: c.vertical.color }}>
                            {c.vertical.name}
                          </span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${c.engagement_type === "retainer" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                          {c.engagement_type === "retainer" ? "Retainer" : "One-time"}
                        </span>
                        {c.engagement_type === "retainer" && c.end_month === month && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-rose-100 text-rose-700">
                            final month
                          </span>
                        )}
                        {c.engagement_type === "retainer" && c.start_month === month && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
                            new
                          </span>
                        )}
                        {hasOfferings && isAdmin && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${margin >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {margin >= 0 ? "+" : ""}{margin.toFixed(0)}% margin
                          </span>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-slate-700">
                          {c.engagement_type === "retainer" ? `${fmt(c.monthly_value || 0)}/mo` : fmt(c.amount || 0)}
                        </p>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedClient ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Users2 className="w-14 h-14 mb-3 opacity-20" />
              <p className="text-sm">Select a client to view details</p>
            </div>
          ) : (() => {
            const sc = selectedClient;
            const { revenue, totalCost, profit, margin, breakdown } = calcProfitability(sc);
            const teamMembers = members.filter(m => (sc.team_member_ids || []).includes(m.id));
            return (
              <div className="max-w-2xl mx-auto space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{sc.name}</h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {sc.vertical && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium"
                          style={{ background: `${sc.vertical.color}20`, color: sc.vertical.color }}>
                          {sc.vertical.name}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${sc.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {sc.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(sc)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => remove(sc.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Profitability — admin only */}
                {isAdmin && breakdown.length > 0 && (
                  <div className={`rounded-xl border p-5 ${margin >= 30 ? "bg-emerald-50 border-emerald-200" : margin >= 0 ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {margin >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-rose-600" />}
                      <p className="font-semibold text-slate-900 text-sm">Profitability</p>
                      <span className={`ml-auto text-lg font-bold ${margin >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {margin >= 0 ? "+" : ""}{margin.toFixed(1)}% margin
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                      {[
                        { label: "Revenue", value: fmt(revenue), cls: "text-slate-800" },
                        { label: "Total Cost", value: fmt(totalCost), cls: "text-rose-700" },
                        { label: "Net Profit", value: fmt(profit), cls: profit >= 0 ? "text-emerald-700" : "text-rose-700" },
                      ].map(x => (
                        <div key={x.label}>
                          <p className="text-xs text-slate-500">{x.label}</p>
                          <p className={`font-bold ${x.cls}`}>{x.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5 border-t border-black/10 pt-3">
                      {breakdown.map(b => (
                        <div key={b.service} className="flex items-center justify-between text-xs">
                          <span className="text-slate-600">{b.service}</span>
                          <span className="text-slate-500 mx-2 flex-1 truncate text-right">{b.note}</span>
                          <span className="font-semibold text-slate-700 shrink-0">{fmt(b.cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Engagement */}
                <div className="bg-white rounded-xl border border-slate-100 p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Engagement</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-slate-400">Type</p>
                      <p className="font-semibold text-slate-800 mt-0.5">{sc.engagement_type === "retainer" ? "Monthly Retainer" : "One-time"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">{sc.engagement_type === "retainer" ? "Running" : "Revenue Month"}</p>
                      <p className="font-semibold text-slate-800 mt-0.5 text-sm">
                        {sc.start_month ? monthLabel(sc.start_month) : "—"}
                        {sc.engagement_type === "retainer" && (
                          sc.end_month
                            ? ` → ${monthLabel(sc.end_month)}`
                            : <span className="text-emerald-600"> → ongoing</span>
                        )}
                      </p>
                    </div>
                    {isAdmin && (
                      <div>
                        <p className="text-xs text-slate-400">{sc.engagement_type === "retainer" ? "Monthly Value" : "Deal Value"}</p>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {fmt((sc.engagement_type === "retainer" ? sc.monthly_value : sc.amount) ?? 0)}
                          {sc.engagement_type === "retainer" && "/mo"}
                        </p>
                      </div>
                    )}
                    {isAdmin && (sc.distribution_payout || 0) > 0 && (
                      <div>
                        <p className="text-xs text-slate-400">Distribution Payout</p>
                        <p className="font-semibold text-rose-600 mt-0.5">
                          −{fmt(sc.distribution_payout || 0)}
                          {sc.engagement_type === "retainer" && "/mo"}
                        </p>
                        <p className="text-[11px] text-slate-400">creators / pages</p>
                      </div>
                    )}
                    {sc.engagement_type === "retainer" && isAdmin && (
                      <div className="sm:col-span-3 pt-1">
                        {sc.end_month ? (
                          <button onClick={() => resume(sc)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg">
                            <Repeat className="w-3.5 h-3.5" /> Resume retainer
                          </button>
                        ) : (
                          <button onClick={() => discontinue(sc)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg">
                            <Ban className="w-3.5 h-3.5" /> Discontinue after {monthLabel(month)}
                          </button>
                        )}
                      </div>
                    )}
                    {sc.deliverables && (
                      <div>
                        <p className="text-xs text-slate-400">Deliverables</p>
                        <p className="text-sm text-slate-700 mt-0.5">{sc.deliverables}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* POC */}
                {(sc.poc_name || sc.contact_name) && (
                  <div className="bg-white rounded-xl border border-slate-100 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <UserCircle className="w-4 h-4 text-slate-400" />
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Point of Contact</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Name", value: sc.poc_name || sc.contact_name },
                        { label: "Role", value: sc.poc_role },
                        { label: "Phone", value: sc.poc_phone || sc.contact_phone },
                        { label: "Email", value: sc.poc_email || sc.contact_email },
                      ].filter(x => x.value).map(x => (
                        <div key={x.label}>
                          <p className="text-xs text-slate-400">{x.label}</p>
                          <p className="text-sm font-medium text-slate-800 mt-0.5">{x.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Team */}
                {teamMembers.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-100 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Users2 className="w-4 h-4 text-slate-400" />
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Account Team</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {teamMembers.map(m => (
                        <div key={m.id} className="flex items-center gap-2 bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-full">
                          <div className="w-5 h-5 rounded-full bg-violet-200 flex items-center justify-center text-violet-700 text-xs font-bold">
                            {m.full_name?.charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-violet-800">{m.full_name}</span>
                          {m.designation && <span className="text-xs text-violet-400">· {m.designation}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Offerings */}
                {(sc.offerings || []).length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-100 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckSquare className="w-4 h-4 text-slate-400" />
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Offerings & Allocation</p>
                    </div>
                    <div className="space-y-2">
                      {(sc.offerings || []).map(o => (
                        <div key={o.service} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                          <div>
                            <span className="text-sm font-medium text-slate-800">{o.service}</span>
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${o.in_house ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                              {o.in_house ? "In-house" : "Outsourced"}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-600">{o.responsible_name || "—"}</p>
                            {!o.in_house && o.outsource_cost > 0 && (
                              <p className="text-xs font-semibold text-rose-600">{fmt(o.outsource_cost)}/mo</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact info */}
                {(sc.office_address || sc.gst_number || sc.contact_name) && (
                  <div className="bg-white rounded-xl border border-slate-100 p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Contact Info</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { icon: Building2, label: "Office", value: sc.office_address },
                        { icon: CreditCard, label: "GST", value: sc.gst_number },
                        { icon: Phone, label: "Phone", value: sc.contact_phone },
                        { icon: Mail, label: "Email", value: sc.contact_email },
                      ].filter(x => x.value).map(({ icon: Icon, label, value }) => (
                        <div key={label} className="flex items-start gap-2">
                          <Icon className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-slate-400">{label}</p>
                            <p className="text-sm text-slate-700">{value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sc.notes && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1"><FileText className="w-3.5 h-3.5 text-amber-600" /><p className="text-xs font-medium text-amber-700">Notes</p></div>
                    <p className="text-sm text-slate-700">{sc.notes}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-slate-900">{editing ? "Edit Client" : "Add Client"}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5">

              {/* Basic info */}
              <section>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Basic Info</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Client / Brand Name *</label>
                    <input value={form.name} onChange={e => sf("name", e.target.value)} placeholder="e.g. Samsung India"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Office Address</label>
                    <input value={form.office_address} onChange={e => sf("office_address", e.target.value)} placeholder="Full address"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">GST Number</label>
                    <input value={form.gst_number} onChange={e => sf("gst_number", e.target.value)} placeholder="22AAAAA0000A1Z5"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Vertical</label>
                    <select value={form.vertical_id || ""} onChange={e => sf("vertical_id", e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="">Select vertical</option>
                      {verticals.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Engagement Type</label>
                    <select value={form.engagement_type} onChange={e => sf("engagement_type", e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="one_time">One-time</option>
                      <option value="retainer">Monthly Retainer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {form.engagement_type === "retainer" ? "Retainer Starts" : "Revenue Month"}
                    </label>
                    <input type="month" value={form.start_month || ""}
                      onChange={e => sf("start_month", e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    <p className="text-[11px] text-slate-400 mt-1">
                      {form.engagement_type === "retainer"
                        ? "Bills every month from here until discontinued"
                        : "Counts once, in this month only"}
                    </p>
                  </div>
                  {form.engagement_type === "retainer" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Discontinued After <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input type="month" value={form.end_month || ""} min={form.start_month || undefined}
                        onChange={e => sf("end_month", e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                      <p className="text-[11px] text-slate-400 mt-1">Leave blank while the retainer is running</p>
                    </div>
                  )}
                  {isAdmin && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {form.engagement_type === "retainer" ? "Monthly Value (₹)" : "Deal Value (₹)"}
                      </label>
                      <input type="number" onWheel={e => e.currentTarget.blur()} value={form.engagement_type === "retainer" ? (form.monthly_value || "") : (form.amount || "")}
                        onChange={e => sf(form.engagement_type === "retainer" ? "monthly_value" : "amount", e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    </div>
                  )}
                  {isAdmin && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Distribution Payout (₹)</label>
                      <input type="number" onWheel={e => e.currentTarget.blur()} value={form.distribution_payout || ""}
                        onChange={e => sf("distribution_payout", e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Paid to creators / pages for placements{form.engagement_type === "retainer" ? ", per month" : ""} — deducted from profit
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                    <select value={form.status || "active"} onChange={e => sf("status", e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                      {["active", "paused", "churned", "prospect"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Deliverables</label>
                    <input value={form.deliverables} onChange={e => sf("deliverables", e.target.value)} placeholder="e.g. 4 Reels/month"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                </div>
              </section>

              {/* POC */}
              <section>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Point of Contact (Client Side)</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "POC Name", key: "poc_name", placeholder: "Contact person" },
                    { label: "POC Role / Designation", key: "poc_role", placeholder: "e.g. Marketing Manager" },
                    { label: "POC Phone", key: "poc_phone", placeholder: "+91 98765 43210" },
                    { label: "POC Email", key: "poc_email", placeholder: "poc@client.com" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                      <input value={String((form as Record<string, unknown>)[key] || "")} onChange={e => sf(key, e.target.value)} placeholder={placeholder}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    </div>
                  ))}
                </div>
              </section>

              {/* Account team */}
              <section>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Account Team (Internal)</p>
                <div className="border border-slate-200 rounded-xl p-3 max-h-36 overflow-y-auto">
                  {members.map(m => (
                    <label key={m.id} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-slate-50 rounded px-1">
                      <input type="checkbox" checked={(form.team_member_ids || []).includes(m.id)} onChange={() => toggleTeamMember(m.id)}
                        className="accent-violet-600 w-3.5 h-3.5 shrink-0" />
                      <span className="text-sm text-slate-800">{m.full_name}</span>
                      {m.designation && <span className="text-xs text-slate-400">· {m.designation}</span>}
                    </label>
                  ))}
                </div>
              </section>

              {/* Offerings */}
              <section>
                <button onClick={() => setOfferingOpen(v => !v)}
                  className="w-full flex items-center justify-between py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> Offerings & Allocation ({(form.offerings || []).length} selected)</span>
                  {offeringOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {offeringOpen && (
                  <div className="mt-2 space-y-3">
                    {/* Checklist */}
                    <div className="flex flex-wrap gap-2">
                      {OFFERINGS.map(svc => {
                        const checked = !!(form.offerings || []).find(o => o.service === svc);
                        return (
                          <button key={svc} onClick={() => toggleOffering(svc)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${checked ? "bg-violet-600 text-white border-violet-600" : "border-slate-200 text-slate-600 hover:border-violet-400"}`}>
                            {checked ? "✓ " : ""}{svc}
                          </button>
                        );
                      })}
                      {/* Custom */}
                      {(form.offerings || []).filter(o => !OFFERINGS.includes(o.service)).map(o => (
                        <button key={o.service} onClick={() => toggleOffering(o.service)}
                          className="px-3 py-1.5 rounded-full text-xs font-medium border bg-violet-600 text-white border-violet-600">
                          ✓ {o.service}
                        </button>
                      ))}
                    </div>
                    {/* Add custom */}
                    <div className="flex gap-2">
                      <input value={customOffering} onChange={e => setCustomOffering(e.target.value)} placeholder="Add other offering…"
                        onKeyDown={e => e.key === "Enter" && addCustomOffering()}
                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                      <button onClick={addCustomOffering} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600">+ Add</button>
                    </div>

                    {/* Per-offering config */}
                    {(form.offerings || []).length > 0 && (
                      <div className="space-y-3 border border-slate-100 rounded-xl p-3">
                        {(form.offerings || []).map(o => (
                          <div key={o.service} className="bg-slate-50 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-slate-800">{o.service}</span>
                              <div className="flex gap-1">
                                {[true, false].map(val => (
                                  <button key={String(val)} onClick={() => updateOffering(o.service, { in_house: val, responsible_type: "", responsible_id: "", responsible_name: "" })}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${o.in_house === val ? (val ? "bg-blue-600 text-white" : "bg-amber-500 text-white") : "bg-white border border-slate-200 text-slate-500"}`}>
                                    {val ? "In-house" : "Outsourced"}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {o.in_house ? (
                              <div>
                                <label className="block text-xs text-slate-500 mb-1">Responsible Team Member</label>
                                <select
                                  value={o.responsible_id || ""}
                                  onChange={e => {
                                    const m = members.find(x => x.id === e.target.value);
                                    updateOffering(o.service, { responsible_type: "member", responsible_id: e.target.value, responsible_name: m?.full_name || "" });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                                  <option value="">Select team member</option>
                                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}{m.designation ? ` (${m.designation})` : ""}</option>)}
                                </select>
                                {o.responsible_id && memberSalaries[o.responsible_id] && (
                                  <p className="text-xs text-slate-400 mt-1">
                                    <IndianRupee className="w-3 h-3 inline" />{memberSalaries[o.responsible_id].toLocaleString("en-IN")}/mo salary
                                    · allocated across {memberClientCounts[o.responsible_id] || 1} client(s)
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs text-slate-500 mb-1">Vendor / Intern</label>
                                  <select
                                    value={o.responsible_id || ""}
                                    onChange={e => {
                                      const v = vendors.find(x => x.id === e.target.value);
                                      updateOffering(o.service, { responsible_type: v?.type === "intern" ? "intern" : "vendor", responsible_id: e.target.value, responsible_name: v?.name || "" });
                                    }}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                                    <option value="">Select vendor / intern</option>
                                    {vendorList.length > 0 && <optgroup label="Vendors">{vendorList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>}
                                    {interns.length > 0 && <optgroup label="Interns">{interns.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-slate-500 mb-1">Monthly Cost (₹)</label>
                                  <input type="number" onWheel={e => e.currentTarget.blur()} value={o.outsource_cost || ""} placeholder="0"
                                    onChange={e => updateOffering(o.service, { outsource_cost: parseFloat(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Notes */}
              <section>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => sf("notes", e.target.value)} placeholder="Any additional notes…" rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
              </section>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 text-sm bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
