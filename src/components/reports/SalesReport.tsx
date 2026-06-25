"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { TrendingUp, Calendar, Download, Loader2, ExternalLink } from "lucide-react";
import type { Vertical } from "@/lib/types";

interface Lead {
  id: string; company_name: string; contact_name: string; deal_value?: number;
  monthly_value?: number; engagement_type?: string; status: string;
  deal_month?: string; updated_at: string; vertical_id?: string;
  vertical?: { name: string; color: string };
  our_poc?: { full_name: string };
}

interface Props { verticals: Vertical[]; }

function fmt(n?: number) { if (!n) return "—"; if (n >= 1e7) return `₹${(n/1e7).toFixed(1)}Cr`; if (n >= 1e5) return `₹${(n/1e5).toFixed(1)}L`; return `₹${n.toLocaleString("en-IN")}`; }

export default function SalesReport({ verticals }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportingSheet, setExportingSheet] = useState(false);
  const [exportError, setExportError] = useState("");
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("*, vertical:verticals(name,color), our_poc:profiles!leads_our_poc_id_fkey(full_name)")
      .in("status", ["approved", "completed"])
      .order("deal_month", { ascending: false });
    setLeads((data || []) as Lead[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Match by deal_month if set, otherwise fall back to the month the lead was approved (updated_at)
  const monthLeads = leads.filter(l =>
    l.deal_month ? l.deal_month.startsWith(month) : l.updated_at.startsWith(month)
  );
  const retainerLeads = monthLeads.filter(l => l.engagement_type === "retainer");
  const onetimeLeads = monthLeads.filter(l => l.engagement_type !== "retainer");
  const totalRevenue = onetimeLeads.reduce((s, l) => s + (l.deal_value || 0), 0)
    + retainerLeads.reduce((s, l) => s + (l.monthly_value || 0), 0);
  const totalMRR = retainerLeads.reduce((s, l) => s + (l.monthly_value || 0), 0);

  // Vertical breakdown
  const verticalMap = new Map<string, { name: string; color: string; revenue: number; count: number }>();
  for (const lead of monthLeads) {
    const vId = lead.vertical_id || "unknown";
    const vName = lead.vertical?.name || "Unassigned";
    const vColor = lead.vertical?.color || "#94a3b8";
    const val = lead.engagement_type === "retainer" ? (lead.monthly_value || 0) : (lead.deal_value || 0);
    const existing = verticalMap.get(vId);
    if (existing) { existing.revenue += val; existing.count++; }
    else verticalMap.set(vId, { name: vName, color: vColor, revenue: val, count: 1 });
  }
  const verticalBreakdown = [...verticalMap.values()].sort((a, b) => b.revenue - a.revenue);
  const maxVRev = Math.max(...verticalBreakdown.map(v => v.revenue), 1);

  // POC breakdown
  const pocMap = new Map<string, { name: string; revenue: number; count: number }>();
  for (const lead of monthLeads) {
    const name = lead.our_poc?.full_name || "Unassigned";
    const val = lead.engagement_type === "retainer" ? (lead.monthly_value || 0) : (lead.deal_value || 0);
    const ex = pocMap.get(name);
    if (ex) { ex.revenue += val; ex.count++; } else pocMap.set(name, { name, revenue: val, count: 1 });
  }
  const pocBreakdown = [...pocMap.values()].sort((a, b) => b.revenue - a.revenue);

  // 6-month trend
  const trendMonths: { key: string; label: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", { month: "short" });
    const rev = leads.filter(l => l.deal_month ? l.deal_month.startsWith(key) : l.updated_at.startsWith(key))
      .reduce((s, l) => s + (l.engagement_type === "retainer" ? (l.monthly_value || 0) : (l.deal_value || 0)), 0);
    trendMonths.push({ key, label, revenue: rev });
  }
  const maxTrend = Math.max(...trendMonths.map(t => t.revenue), 1);

  const monthLabel = new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  async function exportSheet() {
    setExportingSheet(true); setExportError("");
    const win = window.open("about:blank", "_blank");
    try {
      const rows = monthLeads.map(l => ({
        "Company": l.company_name,
        "Contact": l.contact_name,
        "Vertical": l.vertical?.name || "",
        "POC": l.our_poc?.full_name || "",
        "Type": l.engagement_type === "retainer" ? "Retainer" : "One-time",
        "Revenue (₹)": l.engagement_type === "retainer" ? (l.monthly_value || 0) : (l.deal_value || 0),
        "Month": l.deal_month || "",
      }));
      const res = await fetch("/api/reports/export-sales-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, monthLabel, rows, totalRevenue, totalMRR }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { win?.close(); setExportError(json.error || "Export failed"); return; }
      if (win) win.location.href = json.url; else window.open(json.url, "_blank");
    } catch { win?.close(); setExportError("Export failed. Try again."); }
    finally { setExportingSheet(false); }
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-slate-400" />
            <label className="text-sm font-medium text-slate-700">Report Month:</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <button onClick={exportSheet} disabled={exportingSheet}
            className="flex items-center gap-2 px-4 py-2 text-sm text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50">
            {exportingSheet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
            Export to Google Sheets
          </button>
        </div>
        {exportError && <p className="mt-2 text-xs text-rose-600">{exportError}</p>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Revenue", value: fmt(totalRevenue), sub: monthLabel, color: "bg-emerald-600" },
              { label: "Approved Deals", value: monthLeads.length, sub: `${onetimeLeads.length} one-time · ${retainerLeads.length} retainer`, color: "bg-blue-600" },
              { label: "MRR", value: fmt(totalMRR), sub: "Recurring revenue", color: "bg-amber-500" },
              { label: "Avg Deal Size", value: fmt(monthLeads.length ? Math.round(totalRevenue / monthLeads.length) : 0), sub: "Per client", color: "bg-violet-600" },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className={`w-8 h-8 ${k.color} rounded-lg mb-3`} />
                <p className="text-xs text-slate-500 font-medium">{k.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{k.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* 6-Month Trend */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Revenue Trend — Last 6 Months</h3>
            <div className="flex items-end gap-3 h-40">
              {trendMonths.map(t => (
                <div key={t.key} className="flex-1 flex flex-col items-center gap-1">
                  <p className="text-xs text-slate-500 font-medium">{fmt(t.revenue)}</p>
                  <div className="w-full rounded-t-lg transition-all"
                    style={{ height: `${Math.max(4, (t.revenue / maxTrend) * 120)}px`, background: t.key === month ? "#059669" : "#d1fae5" }} />
                  <p className={`text-xs font-medium ${t.key === month ? "text-emerald-700" : "text-slate-400"}`}>{t.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* Vertical Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Revenue by Vertical</h3>
              {verticalBreakdown.length === 0 ? <p className="text-sm text-slate-400">No data for this month</p> : (
                <div className="space-y-3">
                  {verticalBreakdown.map(v => (
                    <div key={v.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-700 font-medium">{v.name}</span>
                        <span className="text-sm font-bold text-slate-900">{fmt(v.revenue)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(v.revenue / maxVRev) * 100}%`, background: v.color }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{v.count} deal{v.count !== 1 ? "s" : ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* POC Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Revenue by POC</h3>
              {pocBreakdown.length === 0 ? <p className="text-sm text-slate-400">No data for this month</p> : (
                <div className="space-y-3">
                  {pocBreakdown.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                          {p.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.count} deal{p.count !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <p className="font-bold text-slate-900">{fmt(p.revenue)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Deal Table */}
          {monthLeads.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Approved Deals — {monthLabel}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {["Company", "Contact", "Vertical", "POC", "Type", "Revenue"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {monthLeads.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{l.company_name}</td>
                        <td className="px-4 py-3 text-slate-600">{l.contact_name}</td>
                        <td className="px-4 py-3">
                          {l.vertical ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${l.vertical.color}20`, color: l.vertical.color }}>{l.vertical.name}</span> : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{l.our_poc?.full_name || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.engagement_type === "retainer" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                            {l.engagement_type === "retainer" ? "Retainer" : "One-time"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {fmt(l.engagement_type === "retainer" ? l.monthly_value : l.deal_value)}
                          {l.engagement_type === "retainer" && <span className="text-xs text-slate-400">/mo</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-slate-500">Total Revenue</td>
                      <td className="px-4 py-3 font-bold text-emerald-700 text-lg">{fmt(totalRevenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
