"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  Repeat2, Wand2, Lock, Loader2, RefreshCw, Ban,
  ExternalLink, Percent, X, Calendar,
} from "lucide-react";
import type { PlanRow } from "@/lib/types";

interface MonthlyPlan {
  id?: string;
  brief_id: string;
  month: string;
  plan_rows: PlanRow[];
  agency_margin: number;
  status: "draft" | "approved";
  total_client_quote: number;
}

interface Props {
  briefId: string;
  brandName: string;
  pagesPolicy: "can_repeat" | "cannot_repeat";
  retainerStatus: "active" | "discontinued";
  startMonth: string; // YYYY-MM
  brief: Record<string, unknown>;
  userId: string;
  onRetainerStatusChange: (s: "active" | "discontinued") => void;
  onPolicyChange: (p: "can_repeat" | "cannot_repeat") => void;
}

function ym(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthsRange(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return months;
}

function monthLabel(ym: string) {
  return new Date(ym + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function RetainerPlansSection({
  briefId, brandName, pagesPolicy: initPolicy, retainerStatus: initStatus,
  startMonth, brief, userId, onRetainerStatusChange, onPolicyChange,
}: Props) {
  const supabase = createClient();
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(ym(new Date()));
  const [retainerStatus, setRetainerStatus] = useState(initStatus);
  const [pagesPolicy, setPagesPolicy] = useState(initPolicy);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [agencyMargin, setAgencyMargin] = useState(30);
  const [showMarginModal, setShowMarginModal] = useState(false);
  const [pendingMargin, setPendingMargin] = useState("30");
  const [savingStatus, setSavingStatus] = useState(false);

  const endMonth = retainerStatus === "discontinued"
    ? (plans[plans.length - 1]?.month || ym(new Date()))
    : ym(new Date());
  const allMonths = monthsRange(startMonth, endMonth);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("retainer_monthly_plans")
      .select("*")
      .eq("brief_id", briefId)
      .order("month");
    setPlans((data || []) as MonthlyPlan[]);
    setLoading(false);
  }, [briefId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const currentPlan = plans.find(p => p.month === selectedMonth);

  async function generatePlan(margin: number) {
    setGenerating(true);
    setGenError("");
    setShowMarginModal(false);
    try {
      const contentType = (brief.content_type as string) || "both";
      const { data: infs } = await supabase
        .from("influencers")
        .select("*")
        .eq("is_active", true)
        .in("influencer_type", contentType === "both" ? ["creator", "page"] : [contentType === "creators" ? "creator" : "page"])
        .limit(300);

      let excludedHandles: string[] = [];
      if (pagesPolicy === "cannot_repeat") {
        excludedHandles = plans
          .filter(p => p.month < selectedMonth)
          .flatMap(p => (p.plan_rows || []).map((r: PlanRow) =>
            String(r.handle_name || "").replace(/^@/, "").toLowerCase().trim()
          ));
      }

      const res = await fetch("/api/distro/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: { ...brief, deliverables: (brief.deliverables as string) || "" },
          influencers: infs || [],
          agency_margin: margin,
          excluded_handles: excludedHandles,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setGenError(json.error || "Plan generation failed."); return; }
      if (json.empty_db) { setGenError(json.message || "No matching entries in Distro Hub."); return; }

      const planRows: PlanRow[] = (json.plan || []).map((r: Omit<PlanRow, "client_rate" | "client_total">) => {
        const agencyCost = r.total_cost || (r.rate * r.quantity);
        return {
          ...r,
          total_cost: agencyCost,
          client_rate: Math.round(r.rate * (1 + margin / 100)),
          client_total: Math.round(agencyCost * (1 + margin / 100)),
        };
      });

      const totalClientQuote = planRows.reduce((s, r) => s + (r.client_total || 0), 0);

      const { data: saved } = await supabase
        .from("retainer_monthly_plans")
        .upsert({
          brief_id: briefId,
          month: selectedMonth,
          plan_rows: planRows,
          agency_margin: margin,
          status: "draft",
          total_client_quote: totalClientQuote,
          created_by: userId,
        }, { onConflict: "brief_id,month" })
        .select()
        .single();

      if (saved) {
        setPlans(prev => {
          const exists = prev.find(p => p.month === selectedMonth);
          return exists
            ? prev.map(p => p.month === selectedMonth ? saved as MonthlyPlan : p)
            : [...prev, saved as MonthlyPlan].sort((a, b) => a.month.localeCompare(b.month));
        });
      }
      setAgencyMargin(margin);
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function approvePlan() {
    if (!currentPlan?.id) return;
    setSavingStatus(true);
    await supabase.from("retainer_monthly_plans").update({ status: "approved" }).eq("id", currentPlan.id);
    setPlans(prev => prev.map(p => p.month === selectedMonth ? { ...p, status: "approved" } : p));
    setSavingStatus(false);
  }

  async function discontinue() {
    if (!confirm(`Mark ${brandName} retainer as discontinued? No new monthly plans can be generated.`)) return;
    await supabase.from("client_briefs").update({ retainer_status: "discontinued" }).eq("id", briefId);
    setRetainerStatus("discontinued");
    onRetainerStatusChange("discontinued");
  }

  async function reactivate() {
    await supabase.from("client_briefs").update({ retainer_status: "active" }).eq("id", briefId);
    setRetainerStatus("active");
    onRetainerStatusChange("active");
  }

  async function setPolicy(p: "can_repeat" | "cannot_repeat") {
    setPagesPolicy(p);
    onPolicyChange(p);
    await supabase.from("client_briefs").update({ retainer_pages_policy: p }).eq("id", briefId);
  }

  const approvedCount = plans.filter(p => p.status === "approved").length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
            <Repeat2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Retainer Monthly Plans — {brandName}</h3>
            <p className="text-xs text-slate-500">
              {allMonths.length} month{allMonths.length !== 1 ? "s" : ""}
              {" · "}{approvedCount} approved
              {" · "}<span className={retainerStatus === "active" ? "text-emerald-600" : "text-rose-500"}>{retainerStatus === "active" ? "Active" : "Discontinued"}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Pages policy toggle */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setPolicy("can_repeat")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${pagesPolicy === "can_repeat" ? "bg-violet-600 text-white" : "text-slate-600 hover:text-slate-800"}`}>
              🔁 Can repeat pages
            </button>
            <button
              onClick={() => setPolicy("cannot_repeat")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${pagesPolicy === "cannot_repeat" ? "bg-violet-600 text-white" : "text-slate-600 hover:text-slate-800"}`}>
              🆕 New pages only
            </button>
          </div>
          {retainerStatus === "active" ? (
            <button onClick={discontinue}
              className="flex items-center gap-1.5 text-xs text-rose-600 border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors">
              <Ban className="w-3.5 h-3.5" /> Discontinue
            </button>
          ) : (
            <button onClick={reactivate}
              className="flex items-center gap-1.5 text-xs text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Reactivate
            </button>
          )}
        </div>
      </div>

      {/* Month tabs */}
      <div className="flex gap-2 px-6 py-3 border-b border-slate-100 overflow-x-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-xs py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading plans…
          </div>
        ) : allMonths.length === 0 ? (
          <span className="text-xs text-slate-400 py-1">No months yet — select start month above</span>
        ) : (
          allMonths.map(m => {
            const plan = plans.find(p => p.month === m);
            const isSelected = m === selectedMonth;
            const isApproved = plan?.status === "approved";
            const isDraft = plan && plan.status === "draft";
            return (
              <button key={m} onClick={() => setSelectedMonth(m)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all whitespace-nowrap ${
                  isSelected
                    ? isApproved
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : isDraft
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-blue-500 bg-blue-50 text-blue-700"
                    : isApproved
                      ? "border-emerald-200 bg-emerald-50/50 text-emerald-600 hover:border-emerald-400"
                      : isDraft
                        ? "border-violet-200 bg-violet-50/50 text-violet-600 hover:border-violet-400"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}>
                {monthLabel(m).replace(" 20", " '")}
                {isApproved && " ✓"}
                {isDraft && !isApproved && " •"}
              </button>
            );
          })
        )}
      </div>

      {/* Selected month content */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold text-slate-900">{monthLabel(selectedMonth)}</h4>
            {pagesPolicy === "cannot_repeat" && (() => {
              const excludedCount = new Set(
                plans
                  .filter(p => p.month < selectedMonth)
                  .flatMap(p => (p.plan_rows || []).map((r: PlanRow) =>
                    String(r.handle_name || "").replace(/^@/, "").toLowerCase().trim()
                  ))
              ).size;
              return excludedCount > 0 ? (
                <p className="text-xs text-amber-600 mt-0.5">
                  🆕 New pages only — {excludedCount} handle{excludedCount !== 1 ? "s" : ""} excluded from previous months
                </p>
              ) : null;
            })()}
          </div>

          <div className="flex items-center gap-2">
            {currentPlan ? (
              <>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${currentPlan.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
                  {currentPlan.status === "approved" ? "✓ Approved" : "Draft"}
                </span>
                <span className="text-xs text-slate-500">Client: {fmt(currentPlan.total_client_quote)}</span>
                {currentPlan.status === "draft" && (
                  <button onClick={approvePlan} disabled={savingStatus}
                    className="flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    <Lock className="w-3 h-3" /> Approve
                  </button>
                )}
                {retainerStatus === "active" && (
                  <button
                    onClick={() => { setPendingMargin(String(currentPlan.agency_margin || agencyMargin)); setShowMarginModal(true); }}
                    disabled={generating}
                    className="flex items-center gap-1.5 text-xs border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors">
                    <RefreshCw className="w-3 h-3" /> Regenerate
                  </button>
                )}
              </>
            ) : retainerStatus === "active" ? (
              <button
                onClick={() => { setPendingMargin(String(agencyMargin)); setShowMarginModal(true); }}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {generating ? "Generating…" : `Generate ${monthLabel(selectedMonth)} Plan`}
              </button>
            ) : (
              <span className="text-xs text-slate-400 italic">Retainer discontinued</span>
            )}
          </div>
        </div>

        {genError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">{genError}</div>
        )}

        {generating && (
          <div className="flex items-center gap-3 py-12 justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <span className="text-sm">
              Generating {monthLabel(selectedMonth)} plan
              {pagesPolicy === "cannot_repeat" ? " (excluding previously used pages)…" : "…"}
            </span>
          </div>
        )}

        {!generating && currentPlan && currentPlan.plan_rows?.length > 0 && (
          <MonthPlanTable rows={currentPlan.plan_rows} />
        )}

        {!generating && !currentPlan && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Calendar className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">No plan for {monthLabel(selectedMonth)}</p>
            {retainerStatus === "active" && (
              <p className="text-xs mt-1">Click "Generate Plan" to create this month's distribution plan</p>
            )}
          </div>
        )}
      </div>

      {/* Margin modal */}
      {showMarginModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-blue-500" />
                <h3 className="font-semibold text-slate-900">Agency Margin — {monthLabel(selectedMonth)}</h3>
              </div>
              <button onClick={() => setShowMarginModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="number" min={0} max={100} value={pendingMargin}
                  onChange={e => setPendingMargin(e.target.value)}
                  className="flex-1 px-4 py-3 text-2xl font-bold text-center border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <span className="text-2xl font-bold text-slate-400">%</span>
              </div>
              <div className="flex gap-2">
                {[20, 25, 30, 35, 40].map(m => (
                  <button key={m} onClick={() => setPendingMargin(String(m))}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${pendingMargin === String(m) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
                    {m}%
                  </button>
                ))}
              </div>
              <MarginBreakdown budget={Number(brief.total_budget) || 0} margin={Number(pendingMargin) || 0} />
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowMarginModal(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button
                onClick={() => {
                  const m = Math.min(100, Math.max(0, Number(pendingMargin) || 0));
                  setAgencyMargin(m);
                  generatePlan(m);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                <Wand2 className="w-4 h-4" /> Generate Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MarginBreakdown({ budget, margin }: { budget: number; margin: number }) {
  if (!budget || !margin) return null;
  const agencySpend = Math.round(budget / (1 + margin / 100));
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1.5">
      <div className="flex justify-between">
        <span>Monthly budget</span>
        <span className="font-bold">₹{budget.toLocaleString("en-IN")}</span>
      </div>
      <div className="flex justify-between">
        <span>Media spend</span>
        <span className="font-semibold">₹{agencySpend.toLocaleString("en-IN")}</span>
      </div>
      <div className="flex justify-between border-t border-blue-200 pt-1.5">
        <span>Agency earning ({margin}%)</span>
        <span className="font-bold text-emerald-700">₹{(budget - agencySpend).toLocaleString("en-IN")}</span>
      </div>
    </div>
  );
}

function MonthPlanTable({ rows }: { rows: PlanRow[] }) {
  const totalAgency = rows.reduce((s, r) => s + (r.total_cost || 0), 0);
  const totalClient = rows.reduce((s, r) => s + (r.client_total || 0), 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-sm min-w-[800px]">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-400 w-8">#</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase w-44">Handle / Page</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Platform</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Category</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Followers</th>
            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Deliverable</th>
            <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase w-10">Qty</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Agency Rate</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Agency Total</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-blue-600 bg-blue-50 uppercase">Client Rate</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-blue-600 bg-blue-50 uppercase">Client Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/80">
              <td className="px-3 py-2.5 text-center text-xs font-medium text-slate-400">{i + 1}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-slate-900 truncate">{r.handle_name}</span>
                  {r.channel_link && (
                    <a href={r.channel_link} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 text-slate-400 hover:text-blue-500">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5 text-slate-600 capitalize text-xs">{r.platform}</td>
              <td className="px-3 py-2.5">
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{r.category}</span>
              </td>
              <td className="px-3 py-2.5 text-slate-600 text-xs">{r.followers}</td>
              <td className="px-3 py-2.5">
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{r.deliverable_type}</span>
              </td>
              <td className="px-3 py-2.5 text-center font-medium text-slate-700">{r.quantity}</td>
              <td className="px-3 py-2.5 text-right text-slate-500 text-xs">₹{Number(r.rate).toLocaleString("en-IN")}</td>
              <td className="px-3 py-2.5 text-right text-slate-700 font-medium text-xs">₹{Number(r.total_cost).toLocaleString("en-IN")}</td>
              <td className="px-3 py-2.5 text-right text-blue-600 font-medium text-xs bg-blue-50/30">₹{Number(r.client_rate).toLocaleString("en-IN")}</td>
              <td className="px-3 py-2.5 text-right text-blue-700 font-bold text-xs bg-blue-50/30">₹{Number(r.client_total).toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50">
            <td colSpan={8} className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Agency Total</td>
            <td className="px-3 py-2.5 font-bold text-slate-700 text-xs">₹{totalAgency.toLocaleString("en-IN")}</td>
            <td className="px-3 py-2.5 text-right text-xs font-semibold text-blue-600">Client Quote</td>
            <td className="px-3 py-2.5 font-bold text-blue-700 text-xs">₹{totalClient.toLocaleString("en-IN")}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
