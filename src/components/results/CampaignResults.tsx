"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import {
  BarChart3, Link2, RefreshCw, FileDown, Target,
  CheckCircle, AlertCircle, Clock, Loader2, Save,
  TrendingUp, Eye, Heart, MessageCircle, Share2, Users, Search, Copy, Send,
} from "lucide-react";
import type { PlanRow, ResultRow } from "@/lib/types";

interface Brief {
  id: string;
  brand_name: string;
  industry?: string;
  campaign_type?: string;
  campaign_objective?: string;
  status: string;
  media_plan_json?: PlanRow[];
  created_at: string;
  submission_token?: string;
}

interface CampaignResult {
  id: string;
  brief_id: string;
  target_deliverables?: number;
  target_views?: number;
  target_reach?: number;
  target_engagements?: number;
  target_impressions?: number;
  result_rows: ResultRow[];
  updated_at: string;
}

interface Props {
  initialBriefId?: string | null;
}

function fmtNum(n?: number | null) {
  if (!n && n !== 0) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

function pct(actual?: number, target?: number): { val: string; color: string } {
  if (!actual || !target) return { val: "—", color: "text-slate-400" };
  const p = Math.round((actual / target) * 100);
  return {
    val: `${p}%`,
    color: p >= 100 ? "text-emerald-600" : p >= 70 ? "text-amber-600" : "text-rose-500",
  };
}

export default function CampaignResults({ initialBriefId }: Props) {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(initialBriefId || null);
  const [selectedBrief, setSelectedBrief] = useState<Brief | null>(null);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [targets, setTargets] = useState({ deliverables: "", views: "", reach: "", engagements: "", impressions: "" });
  const [campaignSearch, setCampaignSearch] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [submissionToken, setSubmissionToken] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const supabase = createClient();

  const filteredBriefs = useMemo(
    () => briefs.filter(b =>
      b.brand_name.toLowerCase().includes(campaignSearch.toLowerCase()) ||
      (b.industry || "").toLowerCase().includes(campaignSearch.toLowerCase())
    ),
    [briefs, campaignSearch]
  );

  // Load all briefs that have a media plan (regardless of status)
  useEffect(() => {
    supabase.from("client_briefs")
      .select("id, brand_name, industry, campaign_type, campaign_objective, status, media_plan_json, created_at")
      .not("media_plan_json", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => setBriefs((data || []) as Brief[]));
  }, []);

  // Load selected brief and its result
  useEffect(() => {
    if (!selectedBriefId) { setSelectedBrief(null); setResult(null); setRows([]); setSubmissionToken(null); return; }
    const brief = briefs.find(b => b.id === selectedBriefId) || null;
    setSelectedBrief(brief);
    if (brief?.media_plan_json) {
      loadOrInitResult(selectedBriefId, brief.media_plan_json);
    }
    // Fetch submission token for this brief
    supabase.from("client_briefs")
      .select("submission_token")
      .eq("id", selectedBriefId)
      .single()
      .then(({ data }) => setSubmissionToken(data?.submission_token || null));
  }, [selectedBriefId, briefs]);

  async function loadOrInitResult(briefId: string, planRows: PlanRow[]) {
    const { data } = await supabase.from("campaign_results").select("*").eq("brief_id", briefId).single();
    if (data) {
      const r = data as CampaignResult;
      setResult(r);
      setTargets({
        deliverables: r.target_deliverables?.toString() || "",
        views: r.target_views?.toString() || "",
        reach: r.target_reach?.toString() || "",
        engagements: r.target_engagements?.toString() || "",
        impressions: r.target_impressions?.toString() || "",
      });
      // Merge saved result rows with current plan (keep live links and metrics)
      const savedMap = new Map((r.result_rows || []).map((rr: ResultRow) => [rr.handle_name + rr.platform, rr]));
      setRows(planRows.map(p => ({
        ...p,
        ...(savedMap.get(p.handle_name + p.platform) || {}),
      })));
    } else {
      setResult(null);
      setTargets({ deliverables: "", views: "", reach: "", engagements: "", impressions: "" });
      setRows(planRows.map(p => ({ ...p, live_link: "" })));
    }
  }

  async function saveResult(updatedRows?: ResultRow[]) {
    if (!selectedBriefId) return;
    setSaving(true);
    const payload = {
      brief_id: selectedBriefId,
      target_deliverables: targets.deliverables ? parseInt(targets.deliverables) : null,
      target_views: targets.views ? parseInt(targets.views) : null,
      target_reach: targets.reach ? parseInt(targets.reach) : null,
      target_engagements: targets.engagements ? parseInt(targets.engagements) : null,
      target_impressions: targets.impressions ? parseInt(targets.impressions) : null,
      result_rows: updatedRows || rows,
      updated_at: new Date().toISOString(),
    };
    if (result?.id) {
      await supabase.from("campaign_results").update(payload).eq("id", result.id);
    } else {
      const { data } = await supabase.from("campaign_results").insert(payload).select().single();
      if (data) setResult(data as CampaignResult);
    }
    setSaving(false);
    setSaveMsg("Saved ✓");
    setTimeout(() => setSaveMsg(""), 2000);
  }

  async function analyse() {
    const linksToFetch = rows.filter(r => r.live_link?.startsWith("http"));
    if (!linksToFetch.length) { alert("Add at least one live link (must start with http)"); return; }
    setAnalysing(true);

    try {
      const res = await fetch("/api/results/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: linksToFetch.map(r => ({ handle_name: r.handle_name, platform: r.platform, live_link: r.live_link, deliverable_type: r.deliverable_type }))
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      const metricsMap = new Map((json.results || []).map((r: ResultRow) => [r.handle_name + r.platform, r]));
      const updatedRows: ResultRow[] = rows.map(r => {
        const metrics = metricsMap.get(r.handle_name + r.platform);
        if (!metrics) return r;
        return { ...r, ...metrics };
      });
      setRows(updatedRows);
      await saveResult(updatedRows);
    } catch (err) {
      alert("Analysis failed: " + String(err));
    } finally {
      setAnalysing(false);
    }
  }

  function updateLiveLink(idx: number, val: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, live_link: val } : r));
  }

  function updateMetric(idx: number, field: keyof ResultRow, val: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val ? Number(val) : undefined } : r));
  }

  const totalViews = rows.reduce((s, r) => s + (r.views || 0), 0);
  const totalReach = rows.reduce((s, r) => s + (r.reach || 0), 0);
  const totalEngagement = rows.reduce((s, r) => s + (r.engagement || (r.likes || 0) + (r.comments || 0) + (r.shares || 0)), 0);
  const totalLikes = rows.reduce((s, r) => s + (r.likes || 0), 0);
  const totalComments = rows.reduce((s, r) => s + (r.comments || 0), 0);
  const completedLinks = rows.filter(r => r.live_link?.startsWith("http")).length;

  function generateReport() {
    if (!selectedBrief) return;
    const now = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const engRate = totalViews > 0 ? ((totalEngagement / totalViews) * 100).toFixed(2) : "—";
    const viewsPct = pct(totalViews, targets.views ? parseInt(targets.views) : undefined);
    const reachPct = pct(totalReach, targets.reach ? parseInt(targets.reach) : undefined);
    const engPct = pct(totalEngagement, targets.engagements ? parseInt(targets.engagements) : undefined);

    const totalClientInvestment = rows.reduce((s, r) => s + (r.client_total || 0), 0);
    const cpv = totalViews > 0 && totalClientInvestment > 0 ? (totalClientInvestment / totalViews).toFixed(2) : null;
    const cpr = totalReach > 0 && totalClientInvestment > 0 ? (totalClientInvestment / totalReach).toFixed(2) : null;
    const cpe = totalEngagement > 0 && totalClientInvestment > 0 ? (totalClientInvestment / totalEngagement).toFixed(2) : null;

    const creatorRows = rows.filter(r => r.live_link).map(r => `
      <tr>
        <td>${r.handle_name}</td>
        <td>${r.platform}</td>
        <td>${r.deliverable_type} × ${r.quantity}</td>
        <td><a href="${r.live_link}" target="_blank">${r.live_link ? "View Post ↗" : "—"}</a></td>
        <td>${fmtNum(r.views)}</td>
        <td>${fmtNum(r.reach)}</td>
        <td>${fmtNum(r.likes)}</td>
        <td>${fmtNum(r.comments)}</td>
        <td>${fmtNum(r.shares)}</td>
        <td>${r.engagement || (r.likes || 0) + (r.comments || 0) + (r.shares || 0) ? fmtNum(r.engagement || (r.likes || 0) + (r.comments || 0) + (r.shares || 0)) : "—"}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${selectedBrief.brand_name} — Campaign Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
  @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

  .cover { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 60px; min-height: 220px; display: flex; flex-direction: column; justify-content: space-between; }
  .cover-logo { font-size: 13px; font-weight: 600; opacity: 0.7; letter-spacing: 2px; text-transform: uppercase; }
  .cover-title { font-size: 38px; font-weight: 800; margin-top: 24px; }
  .cover-sub { font-size: 16px; opacity: 0.8; margin-top: 8px; }
  .cover-meta { display: flex; gap: 24px; margin-top: 32px; flex-wrap: wrap; }
  .cover-meta-item { font-size: 13px; opacity: 0.75; }
  .cover-meta-item span { font-weight: 700; opacity: 1; display: block; font-size: 15px; margin-top: 2px; }

  .section { padding: 40px 60px; border-bottom: 1px solid #f1f5f9; }
  .section-title { font-size: 20px; font-weight: 800; color: #1e293b; margin-bottom: 24px; display: flex; align-items: center; gap-8px; }
  .section-title::before { content: ''; display: inline-block; width: 4px; height: 20px; background: #4f46e5; border-radius: 2px; margin-right: 10px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
  .kpi-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; }
  .kpi-value { font-size: 28px; font-weight: 800; color: #1e293b; margin-top: 6px; }
  .kpi-pct { font-size: 12px; font-weight: 600; margin-top: 4px; }
  .kpi-pct.good { color: #059669; }
  .kpi-pct.warn { color: #d97706; }
  .kpi-pct.bad { color: #dc2626; }
  .kpi-target { font-size: 11px; color: #94a3b8; margin-top: 2px; }

  .target-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .target-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
  .target-card-label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
  .target-bar-wrap { background: #f1f5f9; border-radius: 100px; height: 8px; margin-top: 10px; overflow: hidden; }
  .target-bar { height: 8px; border-radius: 100px; background: linear-gradient(90deg, #4f46e5, #7c3aed); }
  .target-numbers { display: flex; justify-content: space-between; margin-top: 6px; font-size: 12px; color: #475569; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f8fafc; text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafafa; }
  a { color: #4f46e5; text-decoration: none; font-weight: 500; }
  a:hover { text-decoration: underline; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; background: #e0e7ff; color: #3730a3; }

  .footer { padding: 24px 60px; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #94a3b8; }
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(79,70,229,0.4); }
  .print-btn:hover { background: #4338ca; }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-logo">BCC Media Network · Campaign Report</div>
  <div>
    <div class="cover-title">${selectedBrief.brand_name}</div>
    <div class="cover-sub">${selectedBrief.industry || ""}${selectedBrief.campaign_type ? ` · ${selectedBrief.campaign_type}` : ""} Campaign</div>
    <div class="cover-meta">
      <div class="cover-meta-item">Total Creators/Pages<span>${rows.length}</span></div>
      <div class="cover-meta-item">Live Posts<span>${completedLinks}</span></div>
      <div class="cover-meta-item">Total Views<span>${fmtNum(totalViews)}</span></div>
      <div class="cover-meta-item">Engagement Rate<span>${engRate}%</span></div>
      <div class="cover-meta-item">Report Date<span>${now}</span></div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Campaign Performance Summary</div>
  <div class="kpi-grid">
    ${[
      { label: "Total Views", value: fmtNum(totalViews), target: targets.views, actual: totalViews },
      { label: "Total Reach", value: fmtNum(totalReach), target: targets.reach, actual: totalReach },
      { label: "Total Engagements", value: fmtNum(totalEngagement), target: targets.engagements, actual: totalEngagement },
      { label: "Total Likes", value: fmtNum(totalLikes), target: null, actual: null },
      { label: "Total Comments", value: fmtNum(totalComments), target: null, actual: null },
      { label: "Engagement Rate", value: `${engRate}%`, target: null, actual: null },
    ].map(k => {
      const p2 = k.target && k.actual ? Math.round((k.actual / parseInt(k.target)) * 100) : null;
      const cls = p2 ? (p2 >= 100 ? "good" : p2 >= 70 ? "warn" : "bad") : "";
      return `<div class="kpi-card">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
        ${p2 ? `<div class="kpi-pct ${cls}">${p2}% of target</div>` : ""}
        ${k.target ? `<div class="kpi-target">Target: ${fmtNum(parseInt(k.target))}</div>` : ""}
      </div>`;
    }).join("")}
  </div>
</div>

${targets.views || targets.reach || targets.engagements ? `
<div class="section">
  <div class="section-title">Target vs Achieved</div>
  <div class="target-grid">
    ${[
      { label: "Views", actual: totalViews, target: parseInt(targets.views || "0") },
      { label: "Reach", actual: totalReach, target: parseInt(targets.reach || "0") },
      { label: "Engagements", actual: totalEngagement, target: parseInt(targets.engagements || "0") },
    ].filter(t => t.target > 0).map(t => {
      const p3 = Math.min(100, Math.round((t.actual / t.target) * 100));
      return `<div class="target-card">
        <div class="target-card-label">${t.label}</div>
        <div class="target-bar-wrap"><div class="target-bar" style="width:${p3}%"></div></div>
        <div class="target-numbers"><span>${fmtNum(t.actual)} achieved</span><span>Target: ${fmtNum(t.target)}</span></div>
      </div>`;
    }).join("")}
  </div>
</div>` : ""}

${selectedBrief.campaign_objective ? `
<div class="section">
  <div class="section-title">Campaign Objective</div>
  <p style="color:#475569;line-height:1.7">${selectedBrief.campaign_objective}</p>
</div>` : ""}

<div class="section">
  <div class="section-title">Creator &amp; Page Performance</div>
  <table>
    <thead>
      <tr>
        <th>Handle / Page</th>
        <th>Platform</th>
        <th>Deliverable</th>
        <th>Live Post</th>
        <th>Views</th>
        <th>Reach</th>
        <th>Likes</th>
        <th>Comments</th>
        <th>Shares</th>
        <th>Total Eng.</th>
      </tr>
    </thead>
    <tbody>
      ${creatorRows || `<tr><td colspan="10" style="text-align:center;color:#94a3b8;padding:24px">No live links added yet</td></tr>`}
    </tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">Campaign Investment &amp; ROI</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px">
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;text-align:center">
      <div style="font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">Total Client Investment</div>
      <div style="font-size:32px;font-weight:800;color:#15803d">₹${totalClientInvestment.toLocaleString("en-IN")}</div>
    </div>
    ${cpv ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:24px;text-align:center">
      <div style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">Cost Per View</div>
      <div style="font-size:32px;font-weight:800;color:#1e40af">₹${cpv}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">${fmtNum(totalViews)} total views</div>
    </div>` : ""}
    ${cpr ? `<div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;padding:24px;text-align:center">
      <div style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">Cost Per Reach</div>
      <div style="font-size:32px;font-weight:800;color:#6d28d9">₹${cpr}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">${fmtNum(totalReach)} total reach</div>
    </div>` : ""}
    ${cpe ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:24px;text-align:center">
      <div style="font-size:11px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">Cost Per Engagement</div>
      <div style="font-size:32px;font-weight:800;color:#b45309">₹${cpe}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">${fmtNum(totalEngagement)} total engagements</div>
    </div>` : ""}
  </div>
</div>

<div class="footer">
  <span>BCC Media Network · Confidential Campaign Report · ${now}</span>
  <span>Generated by BCC Productivity Suite</span>
</div>

<button class="print-btn no-print" onclick="window.print()">⬇ Download PDF</button>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-sm shadow-emerald-200">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Campaign Results</h1>
            <p className="text-sm text-slate-400">Track live performance, fetch metrics, generate client reports</p>
          </div>
        </div>

        {/* Search + Brief selector */}
        <div className="flex flex-col gap-2 w-full">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search campaigns by brand or industry…"
              value={campaignSearch}
              onChange={e => setCampaignSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex items-center gap-3">
          <select
            value={selectedBriefId || ""}
            onChange={e => setSelectedBriefId(e.target.value || null)}
            className="flex-1 max-w-sm px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
          >
            <option value="">
              {briefs.length === 0 ? "No campaigns with media plans yet…" : `Select a Campaign… (${filteredBriefs.length} found)`}
            </option>
            {filteredBriefs.map(b => (
              <option key={b.id} value={b.id}>
                {b.brand_name}{b.industry ? ` · ${b.industry}` : ""}
                {b.status === "completed" ? " ✓" : ""}
              </option>
            ))}
          </select>
          {selectedBrief && (
            <div className="flex items-center gap-2 ml-auto">
              {saveMsg && <span className="text-xs text-emerald-600 font-medium">{saveMsg}</span>}
              <button onClick={() => saveResult()} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600">
                <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={analyse} disabled={analysing}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-60 transition-colors">
                {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                {analysing ? "Analysing…" : "Analyse Live Links"}
              </button>
              <button onClick={generateReport}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                <FileDown className="w-4 h-4" /> Generate Report
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      {!selectedBrief ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            {briefs.length === 0
              ? <><p className="text-sm font-medium text-slate-600">No campaigns with media plans yet</p><p className="text-xs mt-1 max-w-xs">Build a media plan in Distribution Hub for a campaign brief to start tracking results here.</p></>
              : <p className="text-sm">Search and select a campaign above to view results</p>
            }
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Creator Submission Link */}
          {submissionToken && (() => {
            const submissionUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/submit/${submissionToken}`;
            const pendingHandles = (selectedBrief?.media_plan_json || []).filter(
              p => !rows.some(r => r.handle_name?.replace(/^@/, "").toLowerCase() === p.handle_name?.replace(/^@/, "").toLowerCase() && r.submitted_at)
            );
            const submittedHandles = (selectedBrief?.media_plan_json || []).filter(
              p => rows.some(r => r.handle_name?.replace(/^@/, "").toLowerCase() === p.handle_name?.replace(/^@/, "").toLowerCase() && r.submitted_at)
            );
            return (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Send className="w-4 h-4 text-blue-600" />
                  <h3 className="font-semibold text-slate-900">Creator Submissions</h3>
                  <span className="text-xs text-slate-400 ml-1">Share this link with page owners to collect analytics</span>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 font-mono truncate">
                    {submissionUrl}
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(submissionUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {linkCopied ? "Copied!" : "Copy Link"}
                  </button>
                </div>
                {(selectedBrief?.media_plan_json?.length || 0) > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Pending ({pendingHandles.length})
                      </p>
                      {pendingHandles.length === 0
                        ? <p className="text-xs text-amber-600">All pages submitted!</p>
                        : <div className="space-y-1">
                            {pendingHandles.map(p => (
                              <div key={p.handle_name} className="text-xs text-amber-800 bg-amber-100 rounded px-2 py-1">
                                {p.handle_name} <span className="text-amber-500">· {p.platform}</span>
                              </div>
                            ))}
                          </div>
                      }
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                      <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Submitted ({submittedHandles.length})
                      </p>
                      {submittedHandles.length === 0
                        ? <p className="text-xs text-emerald-600">No submissions yet</p>
                        : <div className="space-y-1">
                            {submittedHandles.map(p => (
                              <div key={p.handle_name} className="text-xs text-emerald-800 bg-emerald-100 rounded px-2 py-1">
                                {p.handle_name} <span className="text-emerald-500">· {p.platform}</span>
                              </div>
                            ))}
                          </div>
                      }
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Target Metrics */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-indigo-600" />
              <h3 className="font-semibold text-slate-900">Campaign Targets</h3>
              <span className="text-xs text-slate-400 ml-1">Set your KPI targets for benchmarking</span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {([
                { key: "deliverables", label: "Deliverables" },
                { key: "views", label: "Target Views" },
                { key: "reach", label: "Target Reach" },
                { key: "engagements", label: "Target Engagements" },
                { key: "impressions", label: "Target Impressions" },
              ] as const).map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
                  <input
                    type="number"
                    value={targets[key]}
                    onChange={e => setTargets(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder="e.g. 500000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* KPI Summary (shown once we have some data) */}
          {(totalViews > 0 || totalReach > 0 || totalEngagement > 0) && (
            <div className="grid grid-cols-6 gap-3">
              {[
                { icon: Eye, label: "Total Views", value: fmtNum(totalViews), target: targets.views ? parseInt(targets.views) : undefined, actual: totalViews, color: "blue" },
                { icon: Users, label: "Total Reach", value: fmtNum(totalReach), target: targets.reach ? parseInt(targets.reach) : undefined, actual: totalReach, color: "violet" },
                { icon: TrendingUp, label: "Engagements", value: fmtNum(totalEngagement), target: targets.engagements ? parseInt(targets.engagements) : undefined, actual: totalEngagement, color: "emerald" },
                { icon: Heart, label: "Total Likes", value: fmtNum(totalLikes), target: undefined, actual: undefined, color: "rose" },
                { icon: MessageCircle, label: "Comments", value: fmtNum(totalComments), target: undefined, actual: undefined, color: "amber" },
                { icon: Share2, label: "Eng. Rate", value: totalViews > 0 ? `${((totalEngagement / totalViews) * 100).toFixed(2)}%` : "—", target: undefined, actual: undefined, color: "indigo" },
              ].map(({ icon: Icon, label, value, target, actual, color }) => {
                const p2 = pct(actual, target);
                return (
                  <div key={label} className={`bg-${color}-50 border border-${color}-100 rounded-xl px-4 py-3`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={`w-3.5 h-3.5 text-${color}-500`} />
                      <p className={`text-xs font-medium text-${color}-600`}>{label}</p>
                    </div>
                    <p className={`text-xl font-bold text-${color}-700`}>{value}</p>
                    {target && <p className={`text-xs font-semibold mt-0.5 ${p2.color}`}>{p2.val} of target</p>}
                    {target && <p className="text-[10px] text-slate-400">Target: {fmtNum(target)}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Creator Results Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-slate-600" />
                <h3 className="font-semibold text-slate-900">Creator / Page Performance</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">{completedLinks}/{rows.length} links added</span>
                {rows.some(r => r.fetched_at) && (
                  <button onClick={analyse} disabled={analysing}
                    className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 border border-violet-200 px-2.5 py-1 rounded-lg hover:bg-violet-50 transition-colors">
                    <RefreshCw className={`w-3 h-3 ${analysing ? "animate-spin" : ""}`} /> Update
                  </button>
                )}
              </div>
            </div>
            {analysing && (
              <div className="px-6 py-3 bg-violet-50 border-b border-violet-100">
                <div className="flex items-center gap-2 text-xs text-violet-700">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analysing live links with AI… fetching publicly available metrics from each post. This may take 1–2 minutes.
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">Handle / Page</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Platform</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Deliverable</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 min-w-64">Live Link</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-blue-600 bg-blue-50">Views</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-blue-600 bg-blue-50">Reach</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-rose-600 bg-rose-50">Likes</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-600 bg-amber-50">Comments</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-emerald-600 bg-emerald-50">Shares</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-violet-600 bg-violet-50">Engagement</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400">Fetched</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((row, i) => {
                    const hasLink = row.live_link?.startsWith("http");
                    const hasFetched = Boolean(row.fetched_at);
                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">{row.handle_name}</td>
                        <td className="px-4 py-3 text-slate-600 capitalize">{row.platform}</td>
                        <td className="px-4 py-3 text-slate-600">{row.deliverable_type} × {row.quantity}</td>
                        <td className="px-4 py-3">
                          <input
                            value={row.live_link || ""}
                            onChange={e => updateLiveLink(i, e.target.value)}
                            onBlur={() => saveResult()}
                            placeholder="https://instagram.com/p/…"
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                          />
                        </td>
                        <td className="px-4 py-3">
                          {!hasLink ? (
                            <span className="flex items-center gap-1 text-xs text-slate-400"><Clock className="w-3 h-3" /> Pending</span>
                          ) : hasFetched ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-3 h-3" /> Fetched</span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-600"><AlertCircle className="w-3 h-3" /> Ready</span>
                          )}
                        </td>
                        {(["views", "reach", "likes", "comments", "shares"] as const).map(field => (
                          <td key={field} className="px-4 py-3">
                            <input
                              type="number"
                              value={row[field] ?? ""}
                              onChange={e => updateMetric(i, field, e.target.value)}
                              onBlur={() => saveResult()}
                              placeholder="—"
                              className="w-20 px-2 py-1 border border-slate-200 rounded text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-transparent"
                            />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-sm font-medium text-violet-700">
                          {fmtNum(row.engagement || (row.likes || 0) + (row.comments || 0) + (row.shares || 0) || undefined)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {row.fetched_at ? new Date(row.fetched_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                      <td colSpan={5} className="px-4 py-3 text-xs text-slate-500 text-right">TOTALS</td>
                      <td className="px-4 py-3 text-sm text-blue-700">{fmtNum(totalViews)}</td>
                      <td className="px-4 py-3 text-sm text-blue-700">{fmtNum(totalReach)}</td>
                      <td className="px-4 py-3 text-sm text-rose-600">{fmtNum(totalLikes)}</td>
                      <td className="px-4 py-3 text-sm text-amber-600">{fmtNum(totalComments)}</td>
                      <td className="px-4 py-3 text-sm text-emerald-600">{fmtNum(rows.reduce((s, r) => s + (r.shares || 0), 0))}</td>
                      <td className="px-4 py-3 text-sm text-violet-700">{fmtNum(totalEngagement)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Analyse tip */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 text-xs text-indigo-700 flex items-start gap-2">
            <TrendingUp className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>How Analyse works:</strong> Click "Analyse Live Links" after adding live post URLs. Our AI visits each URL and extracts publicly visible metrics (views, likes, comments, shares). YouTube and Reddit metrics are most reliably public. Instagram likes may be hidden — enter those manually if so. All data auto-saves after every fetch.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
