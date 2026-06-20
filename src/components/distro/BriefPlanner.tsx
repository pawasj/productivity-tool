"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  Wand2, FileText, Download, Check, Lock, Pencil,
  ChevronDown, ChevronUp, Loader2, Plus, Trash2,
  Search, MessageCircle, X, DatabaseZap, LayoutList,
} from "lucide-react";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BriefForm {
  brand_name: string;
  poc_name: string;
  industry: string;
  campaign_type: string;
  engagement_model: "one_time" | "retainer";
  total_budget: string;
  target_audience: string;
  target_geography: string;
  content_type: "creators" | "pages" | "both";
  campaign_objective: string;
  timeline: string;
  deliverables: string;
  additional_notes: string;
}

interface PlanRow {
  handle_name: string;
  platform: string;
  category: string;
  followers: string;
  deliverable_type: string;
  quantity: number;
  rate: number;
  total_cost: number;
  contact_no?: string;
}

interface DiscoveryResult {
  handle_name: string;
  platform: string;
  category: string;
  followers: string;
  engagement_rate?: string;
  location?: string;
  contact?: string;
  rationale: string;
  match_score: "High" | "Medium" | "Low";
  profile_url?: string;
  type: "creator" | "page";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_BRIEF: BriefForm = {
  brand_name: "", poc_name: "", industry: "", campaign_type: "",
  engagement_model: "one_time", total_budget: "",
  target_audience: "", target_geography: "Pan India",
  content_type: "both",
  campaign_objective: "", timeline: "", deliverables: "", additional_notes: "",
};

const CAMPAIGN_TYPES = ["Brand Awareness", "Product Launch", "Lead Generation", "Engagement", "Sales", "Event Promotion", "Other"];
const INDUSTRIES = ["FMCG", "Tech", "Finance", "Fashion", "Health & Wellness", "Food & Beverage", "Entertainment", "Automobile", "Real Estate", "Other"];

const SCORE_COLOR: Record<string, string> = {
  High: "bg-emerald-100 text-emerald-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-slate-100 text-slate-600",
};

// ─── Word Doc Export ──────────────────────────────────────────────────────────

function exportAsWordDoc(text: string, filename: string) {
  // Convert markdown-ish to HTML that Word understands
  const html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^# (.*)/gm, "<h1 style='font-size:22pt;color:#1e293b'>$1</h1>")
    .replace(/^## (.*)/gm, "<h2 style='font-size:16pt;color:#1e293b'>$1</h2>")
    .replace(/^### (.*)/gm, "<h3 style='font-size:13pt;color:#334155'>$1</h3>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- (.*)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  const doc = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
    xmlns:w='urn:schemas-microsoft-com:office:word'
    xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
    <meta charset='utf-8'>
    <style>
      body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.6; margin: 72pt; }
      h1 { font-size: 22pt; color: #1e293b; margin-top: 24pt; }
      h2 { font-size: 16pt; color: #1e293b; border-bottom: 1pt solid #e2e8f0; padding-bottom: 4pt; margin-top: 18pt; }
      h3 { font-size: 13pt; color: #334155; margin-top: 12pt; }
      p { margin: 8pt 0; }
      ul { margin: 6pt 0 6pt 18pt; }
      li { margin: 3pt 0; }
      strong { font-weight: 700; }
    </style>
  </head>
  <body><p>${html}</p></body>
  </html>`;

  const blob = new Blob(["﻿", doc], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function BriefPlanner() {
  const [brief, setBrief] = useState<BriefForm>(EMPTY_BRIEF);
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [narrative, setNarrative] = useState("");
  const [editNarrative, setEditNarrative] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatingNarrative, setGeneratingNarrative] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveryResult[]>([]);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [approved, setApproved] = useState(false);
  const [crmId, setCrmId] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(true);
  const [showNarrative, setShowNarrative] = useState(true);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const supabase = createClient();

  function sb<K extends keyof BriefForm>(k: K, v: BriefForm[K]) { setBrief(b => ({ ...b, [k]: v })); }
  function totalBudget() { return planRows.reduce((s, r) => s + (r.total_cost || 0), 0); }

  // ── Save to CRM ────────────────────────────────────────────────────────────
  async function saveToCRM(planJson: PlanRow[], narText: string, existingId?: string): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    const record = {
      brand_name: brief.brand_name,
      brand_poc: brief.poc_name,
      poc_name: brief.poc_name,
      engagement_type: brief.engagement_model,
      budget: parseFloat(brief.total_budget) || 0,
      total_budget: parseFloat(brief.total_budget) || 0,
      industry: brief.industry,
      brief: [
        brief.campaign_objective,
        `Type: ${brief.campaign_type}`,
        `Geography: ${brief.target_geography}`,
        `Audience: ${brief.target_audience}`,
        `Timeline: ${brief.timeline}`,
        `Deliverables: ${brief.deliverables}`,
        brief.additional_notes,
      ].filter(Boolean).join("\n"),
      campaign_type: brief.campaign_type,
      target_audience: brief.target_audience,
      campaign_objective: brief.campaign_objective,
      timeline: brief.timeline,
      media_plan_json: planJson,
      narrative_text: narText,
      status: "draft",
      created_by: user?.id,
      source: "distro",
    };
    if (existingId) {
      const { data } = await supabase.from("client_briefs").update(record).eq("id", existingId).select().single();
      return (data as Record<string, string> | null)?.id || existingId;
    }
    const { data } = await supabase.from("client_briefs").insert(record).select().single();
    return (data as Record<string, string> | null)?.id || null;
  }

  // ── Generate Plan ─────────────────────────────────────────────────────────
  async function generatePlan() {
    if (!brief.brand_name.trim()) { setError("Please enter a brand name."); return; }
    setError(""); setGeneratingPlan(true);
    try {
      const { data: infs } = await supabase.from("influencers").select("*")
        .eq("is_active", true)
        .in("influencer_type", brief.content_type === "both" ? ["creator", "page"] : [brief.content_type === "creators" ? "creator" : "page"])
        .limit(300);
      const res = await fetch("/api/distro/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, influencers: infs || [] }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error || "Plan generation failed."); return; }
      if (json.empty_db) { setError(json.message || "No matching entries in your Distro Hub database. Import creators/pages first, or use Discovery to find new ones."); return; }
      const plan: PlanRow[] = json.plan || [];
      setPlanRows(plan); setShowPlan(true);
      const id = await saveToCRM(plan, narrative, crmId || undefined);
      setCrmId(id); setSaveMsg("✓ Auto-saved to Client CRM");
    } catch { setError("Unexpected error. Check your connection."); }
    finally { setGeneratingPlan(false); }
  }

  // ── Generate Narrative ────────────────────────────────────────────────────
  async function generateNarrative() {
    if (!brief.brand_name.trim()) { setError("Please enter a brand name."); return; }
    setError(""); setGeneratingNarrative(true);
    try {
      const res = await fetch("/api/distro/generate-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, plan: planRows }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error || "Narrative generation failed."); return; }
      const nar: string = json.narrative || "";
      setNarrative(nar); setShowNarrative(true);
      const id = await saveToCRM(planRows, nar, crmId || undefined);
      setCrmId(id); setSaveMsg("✓ Auto-saved to Client CRM");
    } catch { setError("Unexpected error. Check your connection."); }
    finally { setGeneratingNarrative(false); }
  }

  // ── Discovery ─────────────────────────────────────────────────────────────
  async function runDiscovery() {
    if (!brief.brand_name.trim()) { setError("Please enter a brand name before discovering."); return; }
    setError(""); setDiscovering(true); setShowDiscovery(true);
    try {
      const res = await fetch("/api/distro/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error || "Discovery failed."); return; }
      setDiscoveryResults(json.results || []);
    } catch { setError("Discovery failed. Check your connection."); }
    finally { setDiscovering(false); }
  }

  // ── Add discovery result to DB ─────────────────────────────────────────────
  async function addToDatabase(result: DiscoveryResult) {
    const record = {
      handle_name: result.handle_name,
      channel_link: result.profile_url || "",
      platform: result.platform.toLowerCase(),
      category: result.category,
      influencer_type: result.type,
      location: result.location || "",
      contact_no: result.contact || "",
      is_active: true,
    };
    const { data: ex } = await supabase.from("influencers").select("id").eq("handle_name", record.handle_name).eq("platform", record.platform).single();
    if (ex) { await supabase.from("influencers").update(record).eq("id", ex.id); }
    else { await supabase.from("influencers").insert(record); }
    setDiscoveryResults(r => r.map(x => x.handle_name === result.handle_name ? { ...x, addedToDB: true } : x) as DiscoveryResult[]);
  }

  // ── Add discovery result to plan ──────────────────────────────────────────
  function addToPlan(result: DiscoveryResult) {
    const row: PlanRow = {
      handle_name: result.handle_name,
      platform: result.platform,
      category: result.category,
      followers: result.followers,
      deliverable_type: "Reel",
      quantity: 1,
      rate: 0,
      total_cost: 0,
      contact_no: result.contact,
    };
    setPlanRows(r => [...r, row]);
    setShowPlan(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  async function approve() {
    let id = crmId;
    if (!id) { id = await saveToCRM(planRows, narrative); setCrmId(id); }
    if (id) await supabase.from("client_briefs").update({ status: "approved" }).eq("id", id);
    setApproved(true);
  }

  // ── Plan editing ──────────────────────────────────────────────────────────
  function updateRow(i: number, field: keyof PlanRow, val: string | number) {
    setPlanRows(rows => rows.map((r, idx) => {
      if (idx !== i) return r;
      const u = { ...r, [field]: val };
      if (field === "quantity" || field === "rate") {
        u.total_cost = Number(field === "quantity" ? val : u.quantity) * Number(field === "rate" ? val : u.rate);
      }
      return u;
    }));
  }
  function addRow() { setPlanRows(r => [...r, { handle_name: "", platform: "instagram", category: "", followers: "", deliverable_type: "Reel", quantity: 1, rate: 0, total_cost: 0 }]); }
  function removeRow(i: number) { setPlanRows(r => r.filter((_, idx) => idx !== i)); }

  // ── Excel Export ──────────────────────────────────────────────────────────
  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(planRows.map(r => ({
      "Handle / Page": r.handle_name, Platform: r.platform, Category: r.category,
      Followers: r.followers, Deliverable: r.deliverable_type, Qty: r.quantity,
      "Rate (₹)": r.rate, "Total (₹)": r.total_cost,
    })));
    // Column widths
    ws["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 6 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Media Plan");
    XLSX.writeFile(wb, `${brief.brand_name || "MediaPlan"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const hasPlan = planRows.length > 0;
  const hasNarrative = narrative.trim().length > 0;
  const hasContent = hasPlan || hasNarrative;

  // Contacts with phone numbers for WhatsApp
  const contactsWithPhone = planRows.filter(r => r.contact_no && r.contact_no.trim());

  return (
    <div className="space-y-6">

      {/* ── Brief Form ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-5">Campaign Brief</h2>
        <div className="grid grid-cols-2 gap-4">

          {/* Brand + POC */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Brand Name *</label>
            <input value={brief.brand_name} onChange={e => sb("brand_name", e.target.value)} disabled={approved}
              placeholder="e.g. Samsung India"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Client / POC Name</label>
            <input value={brief.poc_name} onChange={e => sb("poc_name", e.target.value)} disabled={approved}
              placeholder="Person you're pitching to"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>

          {/* Industry + Campaign Type */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Industry</label>
            <select value={brief.industry} onChange={e => sb("industry", e.target.value)} disabled={approved}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
              <option value="">Select…</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Campaign Type</label>
            <select value={brief.campaign_type} onChange={e => sb("campaign_type", e.target.value)} disabled={approved}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
              <option value="">Select…</option>
              {CAMPAIGN_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Engagement Model */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Engagement Model</label>
            <div className="flex gap-2">
              {(["one_time", "retainer"] as const).map(v => (
                <button key={v} disabled={approved} onClick={() => sb("engagement_model", v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-60 ${brief.engagement_model === v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}>
                  {v === "one_time" ? "One-time" : "Retainer"}
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Total Budget (₹)</label>
            <input type="number" value={brief.total_budget} onChange={e => sb("total_budget", e.target.value)} disabled={approved}
              placeholder="e.g. 5000000"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>

          {/* Target Audience + Geography */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Target Audience</label>
            <input value={brief.target_audience} onChange={e => sb("target_audience", e.target.value)} disabled={approved}
              placeholder="e.g. Urban millennials 25–35"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Target Geography</label>
            <input value={brief.target_geography} onChange={e => sb("target_geography", e.target.value)} disabled={approved}
              placeholder="e.g. Pan India / Mumbai / South India"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>

          {/* Content Type checkboxes */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-2">Distribution Mix</label>
            <div className="flex gap-3">
              {([
                { value: "creators", label: "Creators / Influencers", desc: "Individual content creators" },
                { value: "pages", label: "Community Page Amplification", desc: "Mass-reach meme & community pages" },
                { value: "both", label: "Both", desc: "Creators + Pages combined plan" },
              ] as const).map(({ value, label, desc }) => (
                <button key={value} disabled={approved} onClick={() => sb("content_type", value)}
                  className={`flex-1 text-left px-4 py-3 rounded-xl border-2 transition-all disabled:opacity-60 ${brief.content_type === value ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${brief.content_type === value ? "border-indigo-500" : "border-slate-300"}`}>
                      {brief.content_type === value && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                    </div>
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                  </div>
                  <p className="text-xs text-slate-500 pl-6">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Timeline + Deliverables */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Timeline</label>
            <input value={brief.timeline} onChange={e => sb("timeline", e.target.value)} disabled={approved}
              placeholder="e.g. June–July 2025, 4 weeks"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Deliverables</label>
            <input value={brief.deliverables} onChange={e => sb("deliverables", e.target.value)} disabled={approved}
              placeholder="e.g. Reels, Posts, Stories"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>

          {/* Objective + Notes */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Campaign Objective</label>
            <textarea value={brief.campaign_objective} onChange={e => sb("campaign_objective", e.target.value)} disabled={approved}
              rows={2} placeholder="What is the key objective of this campaign?"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Additional Notes</label>
            <textarea value={brief.additional_notes} onChange={e => sb("additional_notes", e.target.value)} disabled={approved}
              rows={2} placeholder="Special requirements, preferred creators, do's and don'ts…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50" />
          </div>
        </div>

        {error && <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">{error}</div>}
        {saveMsg && <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg">{saveMsg}</div>}

        {!approved && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={generatePlan} disabled={generatingPlan || !brief.brand_name.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {generatingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {generatingPlan ? "Generating Plan…" : "Generate Media Plan"}
            </button>
            <button onClick={generateNarrative} disabled={generatingNarrative || !brief.brand_name.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-medium text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors">
              {generatingNarrative ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {generatingNarrative ? "Writing Narrative…" : "Generate Narrative"}
            </button>
            <button onClick={runDiscovery} disabled={discovering || !brief.brand_name.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl font-medium text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors">
              {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {discovering ? "Discovering…" : "Discovery"}
            </button>
            {hasContent && (
              <button onClick={approve}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 transition-colors ml-auto">
                <Lock className="w-4 h-4" /> Approve & Lock
              </button>
            )}
          </div>
        )}
        {approved && (
          <div className="mt-4 flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm font-medium">
            <Check className="w-4 h-4" /> Approved and locked for reference
          </div>
        )}
      </div>

      {/* ── Discovery Results ────────────────────────────────────────────── */}
      {showDiscovery && (
        <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-amber-100 bg-amber-50">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-slate-900">Discovery Results</span>
              {discoveryResults.length > 0 && (
                <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  {discoveryResults.length} found
                </span>
              )}
            </div>
            <button onClick={() => setShowDiscovery(false)} className="p-1 hover:bg-amber-100 rounded-lg">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {discovering && (
            <div className="flex items-center gap-3 px-6 py-10 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
              <div>
                <p className="text-sm font-medium text-slate-700">AI is researching the internet…</p>
                <p className="text-xs text-slate-400 mt-0.5">Searching for {brief.content_type === "pages" ? "community pages" : brief.content_type === "creators" ? "creators & influencers" : "creators and community pages"} matching your brief</p>
              </div>
            </div>
          )}

          {!discovering && discoveryResults.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-slate-400">No results found. Try adding more brief details and run Discovery again.</div>
          )}

          {!discovering && discoveryResults.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Handle / Page</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Platform</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Followers</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Engagement</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Match</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Rationale</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {discoveryResults.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        {r.profile_url ? (
                          <a href={r.profile_url} target="_blank" rel="noopener noreferrer"
                            className="font-medium text-blue-600 hover:underline">{r.handle_name}</a>
                        ) : (
                          <span className="font-medium text-slate-800">{r.handle_name}</span>
                        )}
                        {r.location && <p className="text-xs text-slate-400 mt-0.5">{r.location}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 capitalize">{r.platform}</td>
                      <td className="px-4 py-3"><span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full">{r.category}</span></td>
                      <td className="px-4 py-3 text-slate-600">{r.followers}</td>
                      <td className="px-4 py-3 text-slate-600">{r.engagement_rate || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SCORE_COLOR[r.match_score] || SCORE_COLOR.Low}`}>
                          {r.match_score}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-xs">{r.rationale}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => addToDatabase(r)}
                            className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap">
                            <DatabaseZap className="w-3 h-3" /> Add to DB
                          </button>
                          <button onClick={() => addToPlan(r)}
                            className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap">
                            <LayoutList className="w-3 h-3" /> Add to Plan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
                <p className="text-xs text-amber-700">⚠ Discovery results are AI-generated based on internet research. Verify follower counts and contact details before use. Rates shown are estimates.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Media Plan ──────────────────────────────────────────────────── */}
      {hasPlan && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
            <button onClick={() => setShowPlan(v => !v)} className="flex items-center gap-2 font-semibold text-slate-900">
              {showPlan ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Media Plan
              <span className="text-xs font-normal text-slate-500 ml-1">
                {planRows.length} handles · ₹{totalBudget().toLocaleString("en-IN")} total
              </span>
            </button>
            <div className="flex items-center gap-2">
              {!approved && (
                <button onClick={addRow} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50">
                  <Plus className="w-3.5 h-3.5" /> Add row
                </button>
              )}
              <button onClick={exportExcel}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Export Excel
              </button>
              {approved && contactsWithPhone.length > 0 && (
                <button onClick={() => setShowWhatsApp(true)}
                  className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" /> Initiate Conversation
                </button>
              )}
            </div>
          </div>
          {showPlan && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Handle / Page", "Platform", "Category", "Followers", "Deliverable", "Qty", "Rate ₹", "Total ₹"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                    {!approved && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {planRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 group">
                      {approved ? (
                        <>
                          <td className="px-4 py-2 font-medium text-slate-800">{row.handle_name}</td>
                          <td className="px-4 py-2 text-slate-600">{row.platform}</td>
                          <td className="px-4 py-2 text-slate-600">{row.category}</td>
                          <td className="px-4 py-2 text-slate-600">{row.followers}</td>
                          <td className="px-4 py-2 text-slate-600">{row.deliverable_type}</td>
                          <td className="px-4 py-2 text-slate-600">{row.quantity}</td>
                          <td className="px-4 py-2 text-slate-600">₹{Number(row.rate).toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2 font-medium text-slate-800">₹{Number(row.total_cost).toLocaleString("en-IN")}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2"><input value={row.handle_name} onChange={e => updateRow(i, "handle_name", e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-slate-800" /></td>
                          <td className="px-4 py-2"><input value={row.platform} onChange={e => updateRow(i, "platform", e.target.value)} className="w-24 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-slate-600" /></td>
                          <td className="px-4 py-2"><input value={row.category} onChange={e => updateRow(i, "category", e.target.value)} className="w-28 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-slate-600" /></td>
                          <td className="px-4 py-2"><input value={row.followers} onChange={e => updateRow(i, "followers", e.target.value)} className="w-20 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-slate-600" /></td>
                          <td className="px-4 py-2"><input value={row.deliverable_type} onChange={e => updateRow(i, "deliverable_type", e.target.value)} className="w-24 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-slate-600" /></td>
                          <td className="px-4 py-2"><input type="number" value={row.quantity} onChange={e => updateRow(i, "quantity", Number(e.target.value))} className="w-14 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-slate-600" /></td>
                          <td className="px-4 py-2"><input type="number" value={row.rate} onChange={e => updateRow(i, "rate", Number(e.target.value))} className="w-24 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-slate-600" /></td>
                          <td className="px-4 py-2 font-medium text-slate-800">₹{Number(row.total_cost).toLocaleString("en-IN")}</td>
                          <td className="px-4 py-2"><button onClick={() => removeRow(i)} className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 p-1 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={7} className="px-4 py-2.5 text-right text-sm font-semibold text-slate-700">Total</td>
                    <td className="px-4 py-2.5 font-bold text-slate-900">₹{totalBudget().toLocaleString("en-IN")}</td>
                    {!approved && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Narrative ───────────────────────────────────────────────────── */}
      {hasNarrative && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
            <button onClick={() => setShowNarrative(v => !v)} className="flex items-center gap-2 font-semibold text-slate-900">
              {showNarrative ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Campaign Narrative
            </button>
            <div className="flex items-center gap-2">
              {!approved && (
                <button onClick={() => setEditNarrative(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">
                  <Pencil className="w-3.5 h-3.5" /> {editNarrative ? "Preview" : "Edit"}
                </button>
              )}
              <button onClick={() => exportAsWordDoc(narrative, `${brief.brand_name || "Narrative"}_${new Date().toISOString().slice(0, 10)}.doc`)}
                className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Export Word Doc
              </button>
            </div>
          </div>
          {showNarrative && (
            <div className="p-6">
              {editNarrative && !approved ? (
                <textarea value={narrative} onChange={e => setNarrative(e.target.value)} rows={22}
                  className="w-full font-mono text-sm text-slate-700 border border-slate-200 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
              ) : (
                <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{narrative}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── WhatsApp Initiate Conversation Modal ─────────────────────────── */}
      {showWhatsApp && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-600" />
                <h3 className="font-semibold text-slate-900">Initiate Conversation</h3>
              </div>
              <button onClick={() => setShowWhatsApp(false)}><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600 mb-4">
                The following creators / page admins will be messaged on WhatsApp about the <strong>{brief.brand_name}</strong> campaign:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {contactsWithPhone.map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{r.handle_name}</p>
                      <p className="text-xs text-slate-400">{r.platform} · {r.category}</p>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{r.contact_no}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                WhatsApp Business API integration is pending. Once connected, this will send a campaign brief message to all contacts above.
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowWhatsApp(false)}
                className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
              <button disabled
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg opacity-60 cursor-not-allowed">
                <MessageCircle className="w-4 h-4" /> Send via WhatsApp (Pending)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
