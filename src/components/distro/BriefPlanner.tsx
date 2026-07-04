"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import {
  Wand2, FileText, Check, Lock, Pencil,
  ChevronDown, ChevronUp, Loader2, Plus, Trash2,
  Search, MessageCircle, X, DatabaseZap, LayoutList,
  ExternalLink, Percent, LayoutGrid,
} from "lucide-react";
import ManualPlanBuilder from "./ManualPlanBuilder";
import RetainerPlansSection from "./RetainerPlansSection";

import type { PlanRow } from "@/lib/types";

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
  num_pages: string;
  num_deliverables: string;
  additional_notes: string;
  retainer_start_month: string; // YYYY-MM
  retainer_pages_policy: "can_repeat" | "cannot_repeat";
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

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const EMPTY_BRIEF: BriefForm = {
  brand_name: "", poc_name: "", industry: "", campaign_type: "",
  engagement_model: "one_time", total_budget: "",
  target_audience: "", target_geography: "Pan India",
  content_type: "both",
  campaign_objective: "", timeline: "", deliverables: "",
  num_pages: "", num_deliverables: "",
  additional_notes: "",
  retainer_start_month: currentYM(),
  retainer_pages_policy: "can_repeat",
};

const CAMPAIGN_TYPES = ["Brand Awareness", "Product Launch", "Lead Generation", "Engagement", "Sales", "Event Promotion", "Other"];
const INDUSTRIES = ["FMCG", "Tech", "Finance", "Fashion", "Health & Wellness", "Food & Beverage", "Entertainment", "Automobile", "Real Estate", "Other"];

const DELIVERABLE_OPTIONS = ["Reel", "Story", "Post", "Carousel", "Collab Post", "Combo"];

const ALL_PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "reddit", label: "Reddit" },
  { id: "x", label: "X (Twitter)" },
  { id: "newsletter", label: "Newsletter / Substack" },
  { id: "website", label: "Website / Blog" },
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Kolkata", "Pune",
  "Ahmedabad", "Jaipur", "Lucknow", "Chandigarh", "Guwahati", "Bhubaneswar",
];

const INDIAN_LANGUAGES = [
  "Hindi", "Bengali", "Marathi", "Telugu", "Tamil", "Gujarati", "Kannada",
  "Malayalam", "Odia", "Punjabi", "Assamese", "Urdu", "Bhojpuri", "Rajasthani",
  "Maithili", "Haryanvi", "Chhattisgarhi",
];

const SCORE_COLOR: Record<string, string> = {
  High: "bg-emerald-100 text-emerald-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-slate-100 text-slate-600",
};


// ─── Main Component ──────────────────────────────────────────────────────────

interface BriefPlannerProps {
  initialBriefId?: string;
  prefillData?: Record<string, string>;
  onNewBrief?: () => void;
}

export default function BriefPlanner({ initialBriefId, prefillData, onNewBrief }: BriefPlannerProps = {}) {
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
  const [sourceLeadId, setSourceLeadId] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(true);
  const [showNarrative, setShowNarrative] = useState(true);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [savingBrief, setSavingBrief] = useState(false);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  // Discovery modal state
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [discoveryPlatforms, setDiscoveryPlatforms] = useState<string[]>(["instagram", "youtube", "linkedin"]);
  const [discoveryContentType, setDiscoveryContentType] = useState<"creators" | "pages" | "both">("both");
  const [discoveryGeos, setDiscoveryGeos] = useState<string[]>([]);
  const [discoveryLanguages, setDiscoveryLanguages] = useState<string[]>([]);
  const [discoverySegments, setDiscoverySegments] = useState<string[]>(["nano", "micro", "macro"]);
  const [discoveryGeoMode, setDiscoveryGeoMode] = useState<"state" | "language">("state");

  // Margin modal state
  const [showMarginModal, setShowMarginModal] = useState(false);
  const [agencyMargin, setAgencyMargin] = useState<number>(30);
  const [pendingMargin, setPendingMargin] = useState("30");

  // Manual plan builder
  const [showManualBuilder, setShowManualBuilder] = useState(false);

  // Retainer state (synced from brief columns, updated by RetainerPlansSection)
  const [retainerStatus, setRetainerStatus] = useState<"active" | "discontinued">("active");
  const [retainerUserId, setRetainerUserId] = useState<string>("");

  // Deliverable type chips
  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>([]);
  function toggleDeliverable(d: string) {
    setSelectedDeliverables(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  const supabase = createClient();

  // Load existing brief when opened from CRM
  useEffect(() => {
    if (!initialBriefId) return;
    setLoadingBrief(true);
    supabase.from("client_briefs").select("*").eq("id", initialBriefId).single().then(({ data }) => {
      if (!data) { setLoadingBrief(false); return; }
      const d = data as Record<string, unknown>;
      setBrief({
        brand_name: String(d.brand_name || ""),
        poc_name: String(d.poc_name || d.brand_poc || ""),
        industry: String(d.industry || ""),
        campaign_type: String(d.campaign_type || ""),
        engagement_model: (d.engagement_type as "one_time" | "retainer") || "one_time",
        total_budget: d.total_budget ? String(d.total_budget) : d.budget ? String(d.budget) : "",
        target_audience: String(d.target_audience || ""),
        target_geography: String(d.target_geography || "Pan India"),
        content_type: (d.content_type as "creators" | "pages" | "both") || "both",
        campaign_objective: String(d.campaign_objective || ""),
        timeline: String(d.timeline || ""),
        deliverables: String(d.deliverables || ""),
        num_pages: String(d.num_pages || ""),
        num_deliverables: String(d.num_deliverables || ""),
        additional_notes: String(d.additional_notes || ""),
        retainer_start_month: String(d.retainer_start_month || currentYM()),
        retainer_pages_policy: (d.retainer_pages_policy as "can_repeat" | "cannot_repeat") || "can_repeat",
      });
      setRetainerStatus((d.retainer_status as "active" | "discontinued") || "active");
      // fetch userId for retainer section
      supabase.auth.getUser().then(({ data }) => { if (data.user) setRetainerUserId(data.user.id); });
      // Restore deliverable chips from saved string
      const savedDels = String(d.deliverables || "").split(",").map((s: string) => s.trim()).filter((s: string) => DELIVERABLE_OPTIONS.includes(s));
      if (savedDels.length > 0) setSelectedDeliverables(savedDels);
      if (d.media_plan_json && Array.isArray(d.media_plan_json)) {
        const savedRows = (d.media_plan_json as PlanRow[]).map(r => ({
          ...r,
          client_rate: r.client_rate ?? Math.round((r.rate || 0) * 1.3),
          client_total: r.client_total ?? Math.round((r.total_cost || 0) * 1.3),
        }));
        // Enrich channel_link from live influencer DB (case-insensitive match)
        // Fetch all influencers to avoid case-sensitivity issues with .in() filter
        supabase.from("influencers").select("handle_name, channel_link")
          .then(({ data: dbInfs }) => {
            if (dbInfs && dbInfs.length > 0) {
              const linkMap = new Map((dbInfs as { handle_name: string; channel_link?: string }[])
                .map(inf => [inf.handle_name.replace(/^@/, "").toLowerCase().trim(), inf.channel_link || ""]));
              setPlanRows(savedRows.map(r => ({
                ...r,
                channel_link: r.channel_link || linkMap.get(String(r.handle_name || "").replace(/^@/, "").toLowerCase().trim()) || "",
              })));
            } else {
              setPlanRows(savedRows);
            }
          });

        setShowPlan(true);
      }
      if (d.narrative_text) { setNarrative(String(d.narrative_text)); setShowNarrative(true); }
      setCrmId(String(d.id));
      setSaveMsg(`Loaded "${d.brand_name}" — you can edit and re-save below.`);
      setLoadingBrief(false);
    });
  }, [initialBriefId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from lead data when coming from Sales Pipeline
  useEffect(() => {
    if (!prefillData || initialBriefId) return;
    setBrief(b => ({
      ...b,
      brand_name: prefillData.brand_name || b.brand_name,
      poc_name: prefillData.poc_name || b.poc_name,
      total_budget: prefillData.total_budget || b.total_budget,
      target_geography: prefillData.target_geography || b.target_geography,
      additional_notes: prefillData.additional_notes || b.additional_notes,
    }));
    if (prefillData.lead_id) setSourceLeadId(prefillData.lead_id);
  }, [prefillData]); // eslint-disable-line react-hooks/exhaustive-deps

  function sb<K extends keyof BriefForm>(k: K, v: BriefForm[K]) { setBrief(b => ({ ...b, [k]: v })); }

  function totalAgencyCost() { return planRows.reduce((s, r) => s + (r.total_cost || 0), 0); }
  function totalClientQuote() { return planRows.reduce((s, r) => s + (r.client_total || 0), 0); }

  function togglePlatform(p: string) {
    setDiscoveryPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  }

  // ── Save brief fields only (no plan/narrative/status changes) ─────────────
  async function saveBriefOnly() {
    if (!brief.brand_name.trim()) { setError("Please enter a brand name."); return; }
    setSavingBrief(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    const record: Record<string, unknown> = {
      brand_name: brief.brand_name,
      brand_poc: brief.poc_name,
      poc_name: brief.poc_name,
      engagement_type: brief.engagement_model,
      budget: parseFloat(brief.total_budget) || 0,
      total_budget: parseFloat(brief.total_budget) || 0,
      industry: brief.industry,
      campaign_type: brief.campaign_type,
      target_audience: brief.target_audience,
      campaign_objective: brief.campaign_objective,
      timeline: brief.timeline,
      retainer_start_month: brief.retainer_start_month || null,
      retainer_pages_policy: brief.retainer_pages_policy || "can_repeat",
    };
    let err: string | null = null;
    if (crmId) {
      const { error } = await supabase.from("client_briefs").update(record).eq("id", crmId);
      err = error?.message || null;
    } else {
      const { data, error } = await supabase.from("client_briefs")
        .insert({ ...record, status: "draft", created_by: user?.id, source: "distro" })
        .select().single();
      err = error?.message || null;
      if (data) setCrmId((data as Record<string, string>).id);
    }
    setSavingBrief(false);
    if (err) { setError(`Failed to save brief: ${err}`); return; }
    setSaveMsg("✓ Brief saved");
  }

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
      created_by: user?.id,
      source: "distro",
      retainer_start_month: brief.retainer_start_month || null,
      retainer_pages_policy: brief.retainer_pages_policy || "can_repeat",
    };
    if (existingId) {
      // Update without touching status — re-saving must not reset a
      // pitched/approved brief back to draft
      const { data } = await supabase.from("client_briefs").update(record).eq("id", existingId).select().single();
      return (data as Record<string, string> | null)?.id || existingId;
    }
    const { data } = await supabase.from("client_briefs").insert({ ...record, status: "draft" }).select().single();
    const newId = (data as Record<string, string> | null)?.id || null;
    // Link brief back to the source lead in Sales Pipeline
    if (newId && sourceLeadId) {
      await supabase.from("leads").update({ brief_id: newId }).eq("id", sourceLeadId);
    }
    return newId;
  }

  // ── Generate Plan (with margin) ───────────────────────────────────────────
  async function generatePlan(margin: number) {
    if (!brief.brand_name.trim()) { setError("Please enter a brand name."); return; }
    setError(""); setGeneratingPlan(true); setShowMarginModal(false);
    try {
      const { data: infs } = await supabase.from("influencers").select("*")
        .eq("is_active", true)
        .in("influencer_type", brief.content_type === "both" ? ["creator", "page"] : [brief.content_type === "creators" ? "creator" : "page"])
        .limit(300);
      const deliverablesList = selectedDeliverables.length > 0 ? selectedDeliverables.join(", ") : brief.deliverables;
      const res = await fetch("/api/distro/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: { ...brief, deliverables: deliverablesList },
          influencers: infs || [],
          agency_margin: margin,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setError(json.error || "Plan generation failed."); return; }
      if (json.empty_db) { setError(json.message || "No matching entries in your Distro Hub database. Import creators/pages first, or use Discovery."); return; }

      // Budget is inclusive of margin — client total = agency cost × (1 + margin%)
      // This means sum of client_totals ≈ total_budget entered by user
      const plan: PlanRow[] = (json.plan || []).map((r: Omit<PlanRow, "client_rate" | "client_total">) => {
        const agencyCost = r.total_cost || (r.rate * r.quantity);
        const clientRate = Math.round(r.rate * (1 + margin / 100));
        const clientTotal = Math.round(agencyCost * (1 + margin / 100));
        return { ...r, total_cost: agencyCost, client_rate: clientRate, client_total: clientTotal };
      });

      setPlanRows(plan); setShowPlan(true);
      const id = await saveToCRM(plan, narrative, crmId || undefined);
      setCrmId(id);
      // ensure userId is set for RetainerPlansSection
      if (!retainerUserId) {
        const { data } = await supabase.auth.getUser();
        if (data.user) setRetainerUserId(data.user.id);
      }
      setSaveMsg(`✓ Auto-saved to Client CRM · ${margin}% margin applied`);
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
    if (discoveryPlatforms.length === 0) { setError("Select at least one platform."); return; }
    if (discoverySegments.length === 0) { setError("Select at least one creator size segment."); return; }
    setError(""); setDiscovering(true); setShowDiscovery(true); setShowDiscoveryModal(false);
    try {
      const res = await fetch("/api/distro/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: { ...brief, content_type: discoveryContentType },
          platforms: discoveryPlatforms,
          geos: discoveryGeos,
          languages: discoveryLanguages,
          segments: discoverySegments,
        }),
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
    setDiscoveryResults(r => r.map(x => x.handle_name === result.handle_name ? { ...x, _addedToDB: true } : x) as DiscoveryResult[]);
  }

  // ── Add discovery result to plan ──────────────────────────────────────────
  function addToPlan(result: DiscoveryResult) {
    const margin = agencyMargin || 30;
    const row: PlanRow = {
      handle_name: result.handle_name,
      platform: result.platform,
      category: result.category,
      followers: result.followers,
      deliverable_type: "Reel",
      quantity: 1,
      rate: 0,
      total_cost: 0,
      client_rate: 0,
      client_total: 0,
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
        const qty = Number(field === "quantity" ? val : u.quantity);
        const rate = Number(field === "rate" ? val : u.rate);
        u.total_cost = qty * rate;
        u.client_rate = Math.round(rate * (1 + agencyMargin / 100));
        u.client_total = qty * u.client_rate;
      }
      return u;
    }));
  }
  function addRow() {
    setPlanRows(r => [...r, { handle_name: "", platform: "instagram", category: "", followers: "", deliverable_type: "Reel", quantity: 1, rate: 0, total_cost: 0, client_rate: 0, client_total: 0 }]);
  }
  function removeRow(i: number) { setPlanRows(r => r.filter((_, idx) => idx !== i)); }

  // ── Google Export ─────────────────────────────────────────────────────────
  const [exportingSheet, setExportingSheet] = useState(false);
  const [exportingDoc, setExportingDoc] = useState(false);
  const [exportError, setExportError] = useState("");

  async function exportToGoogleSheet() {
    setExportingSheet(true);
    setExportError("");
    // Open the window synchronously before the async call so browsers don't block it as a popup
    const win = window.open("about:blank", "_blank");
    try {
      const res = await fetch("/api/distro/export-google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brief.brand_name, rows: planRows, margin: agencyMargin }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        win?.close();
        setExportError(json.error || "Export failed. Check that your Google account is connected in Profile.");
        return;
      }
      if (win) win.location.href = json.url; else window.open(json.url, "_blank");
    } catch {
      win?.close();
      setExportError("Unexpected error during export. Try again.");
    } finally { setExportingSheet(false); }
  }

  async function exportToGoogleDoc() {
    setExportingDoc(true);
    setExportError("");
    const win = window.open("about:blank", "_blank");
    try {
      const res = await fetch("/api/distro/export-google-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brief.brand_name, narrative }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        win?.close();
        setExportError(json.error || "Export failed. Check that your Google account is connected in Profile.");
        return;
      }
      if (win) win.location.href = json.url; else window.open(json.url, "_blank");
    } catch {
      win?.close();
      setExportError("Unexpected error during export. Try again.");
    } finally { setExportingDoc(false); }
  }

  const hasPlan = planRows.length > 0;
  const hasNarrative = narrative.trim().length > 0;
  const hasContent = hasPlan || hasNarrative;
  const contactsWithPhone = planRows.filter(r => r.contact_no && r.contact_no.trim());

  if (loadingBrief) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3 text-blue-500" />
        <span className="text-sm">Loading brief…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Brief Form ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {sourceLeadId && (
          <div className="mb-4 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-700 flex items-center gap-2">
            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            Pre-filled from Sales Pipeline lead — fill in remaining details and save. This brief will be linked back to the lead automatically.
          </div>
        )}
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-900">
            {initialBriefId ? `Editing: ${brief.brand_name || "Campaign Brief"}` : "Campaign Brief"}
          </h2>
          {initialBriefId && onNewBrief && (
            <button
              onClick={() => { onNewBrief(); }}
              className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> New Brief
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">

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

          {brief.engagement_model === "retainer" && (
            <div className="col-span-2">
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-violet-800 flex items-center gap-1.5">
                  🔁 Retainer Settings
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Retainer Start Month</label>
                    <input
                      type="month"
                      value={brief.retainer_start_month}
                      onChange={e => sb("retainer_start_month", e.target.value)}
                      disabled={approved}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-50" />
                    <p className="text-xs text-slate-400 mt-0.5">First month the retainer goes live</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Page / Handle Policy</label>
                    <div className="flex gap-2">
                      {([
                        { v: "can_repeat" as const, l: "🔁 Can repeat pages", desc: "Include previous months' pages" },
                        { v: "cannot_repeat" as const, l: "🆕 New pages only", desc: "Exclude previously used handles" },
                      ]).map(({ v, l, desc }) => (
                        <button key={v} type="button" disabled={approved}
                          onClick={() => sb("retainer_pages_policy", v)}
                          className={`flex-1 text-left px-3 py-2 rounded-lg border-2 transition-all text-xs disabled:opacity-60 ${brief.retainer_pages_policy === v ? "border-violet-500 bg-violet-100 text-violet-800" : "border-slate-200 text-slate-600 hover:border-violet-300"}`}>
                          <p className="font-semibold">{l}</p>
                          <p className="text-slate-400 mt-0.5">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Total Budget (₹)
              {brief.engagement_model === "retainer" && <span className="text-violet-600 ml-1">(per month)</span>}
            </label>
            <input type="number" value={brief.total_budget} onChange={e => sb("total_budget", e.target.value)} disabled={approved}
              placeholder="e.g. 5000000"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>

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

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Timeline</label>
            <input value={brief.timeline} onChange={e => sb("timeline", e.target.value)} disabled={approved}
              placeholder="e.g. June–July 2025, 4 weeks"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Deliverable Types</label>
            <div className="flex flex-wrap gap-2">
              {DELIVERABLE_OPTIONS.map(d => {
                const active = selectedDeliverables.includes(d);
                return (
                  <button key={d} type="button" disabled={approved} onClick={() => toggleDeliverable(d)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all disabled:opacity-60 ${active ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50"}`}>
                    {d}
                  </button>
                );
              })}
            </div>
            {selectedDeliverables.length === 0 && !approved && (
              <p className="text-xs text-slate-400 mt-1.5">Select at least one — AI will only use these deliverable types</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">No. of Pages / Handles</label>
            <input type="number" min={1} value={brief.num_pages} onChange={e => sb("num_pages", e.target.value)} disabled={approved}
              placeholder="e.g. 10"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
            <p className="text-xs text-slate-400 mt-0.5">How many pages / creators to include in the plan</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Total No. of Deliverables</label>
            <input type="number" min={1} value={brief.num_deliverables} onChange={e => sb("num_deliverables", e.target.value)} disabled={approved}
              placeholder="e.g. 25"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
            <p className="text-xs text-slate-400 mt-0.5">AI will distribute these across all pages (e.g. 15 pages × 25 deliverables = some pages get 2)</p>
          </div>

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
            <button onClick={saveBriefOnly} disabled={savingBrief || !brief.brand_name.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-xl font-medium text-sm hover:bg-slate-900 disabled:opacity-50 transition-colors">
              {savingBrief ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {savingBrief ? "Saving…" : "Save Brief"}
            </button>
            <button
              onClick={() => { if (!brief.brand_name.trim()) { setError("Please enter a brand name."); return; } setError(""); setPendingMargin(String(agencyMargin)); setShowMarginModal(true); }}
              disabled={generatingPlan}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {generatingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {generatingPlan ? "Generating Plan…" : "Generate Media Plan"}
            </button>
            <button onClick={generateNarrative} disabled={generatingNarrative || !brief.brand_name.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-medium text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors">
              {generatingNarrative ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {generatingNarrative ? "Writing Narrative…" : "Generate Narrative"}
            </button>
            <button
              onClick={() => { if (!brief.brand_name.trim()) { setError("Please enter a brand name before discovering."); return; } setError(""); setShowDiscoveryModal(true); }}
              disabled={discovering}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl font-medium text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors">
              {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {discovering ? "Discovering…" : "Discovery"}
            </button>
            <button
              onClick={() => { if (!brief.brand_name.trim()) { setError("Please enter a brand name first."); return; } setError(""); setShowManualBuilder(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-medium text-sm hover:bg-teal-700 transition-colors">
              <LayoutGrid className="w-4 h-4" />
              Build Media Plan Manually
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
              {!discovering && discoveryPlatforms.length > 0 && (
                <span className="text-xs text-slate-500 ml-2">
                  {discoveryPlatforms.join(", ")} · {discoveryContentType === "both" ? "creators + pages" : discoveryContentType}
                  {discoveryGeos.length > 0 && <> · <span className="text-amber-600 font-medium">{discoveryGeos.join(", ")}</span></>}
                  {discoveryLanguages.length > 0 && <> · <span className="text-amber-600 font-medium">{discoveryLanguages.join(", ")} content</span></>}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowDiscoveryModal(true)}
                className="text-xs text-amber-700 border border-amber-300 px-2.5 py-1 rounded-lg hover:bg-amber-100 transition-colors">
                New Search
              </button>
              <button onClick={() => setShowDiscovery(false)} className="p-1 hover:bg-amber-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {discovering && (
            <div className="flex items-center gap-3 px-6 py-10 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
              <div>
                <p className="text-sm font-medium text-slate-700">AI is researching the internet…</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Searching {discoveryPlatforms.join(", ")} for {discoveryContentType === "both" ? "creators and pages" : discoveryContentType}
                  {(discoveryGeos.length > 0 || discoveryLanguages.length > 0) && ` · ${[...discoveryGeos, ...discoveryLanguages].join(", ")} specific`}
                </p>
              </div>
            </div>
          )}

          {!discovering && discoveryResults.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No results found. Try adjusting your platforms or brief details.
            </div>
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
                  {discoveryResults.map((r, i) => {
                    const added = (r as DiscoveryResult & { _addedToDB?: boolean })._addedToDB;
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-800">{r.handle_name}</span>
                          {r.location && <p className="text-xs text-slate-400 mt-0.5">{r.location}</p>}
                          {r.contact && <p className="text-xs text-slate-400">{r.contact}</p>}
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
                          <div className="flex flex-col gap-1 items-end">
                            {r.profile_url && (
                              <a href={r.profile_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap">
                                <ExternalLink className="w-3 h-3" /> Visit Profile
                              </a>
                            )}
                            <button onClick={() => addToDatabase(r)}
                              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${added ? "text-emerald-700 bg-emerald-50" : "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"}`}>
                              <DatabaseZap className="w-3 h-3" /> {added ? "Added ✓" : "Add to DB"}
                            </button>
                            <button onClick={() => addToPlan(r)}
                              className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap">
                              <LayoutList className="w-3 h-3" /> Add to Plan
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
                <p className="text-xs text-amber-700">⚠ Discovery results are AI-generated based on internet research. Verify follower counts and contact details before use.</p>
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
                {planRows.length} handles · Agency: ₹{totalAgencyCost().toLocaleString("en-IN")} · Client: ₹{totalClientQuote().toLocaleString("en-IN")}
              </span>
            </button>
            <div className="flex items-center gap-2">
              {!approved && (
                <>
                  <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                    <Percent className="w-3 h-3" /> {agencyMargin}% margin
                  </span>
                  <button onClick={addRow} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50">
                    <Plus className="w-3.5 h-3.5" /> Add row
                  </button>
                  <button onClick={() => setShowManualBuilder(true)} className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 px-2 py-1 rounded-lg hover:bg-teal-50 border border-teal-200">
                    <DatabaseZap className="w-3.5 h-3.5" /> Add from Database
                  </button>
                </>
              )}
              <button onClick={exportToGoogleSheet} disabled={exportingSheet}
                className="flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-900 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-50 disabled:opacity-50">
                {exportingSheet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                {exportingSheet ? "Exporting…" : "Export to Google Sheets"}
              </button>
              {approved && contactsWithPhone.length > 0 && (
                <button onClick={() => setShowWhatsApp(true)}
                  className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" /> Initiate Conversation
                </button>
              )}
            </div>
          </div>
          {exportError && (
            <div className="mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
              <span className="font-semibold shrink-0">Export error:</span> {exportError}
            </div>
          )}
          {showPlan && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase w-8">#</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase w-48">Handle / Page</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Platform</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Category</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Followers</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Deliverable</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase w-12">Qty</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Agency Rate</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">Agency Total</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-blue-600 bg-blue-50 uppercase">Client Rate</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-blue-600 bg-blue-50 uppercase">Client Total</th>
                    {!approved && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {planRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/80 group">
                      {approved ? (
                        <>
                          <td className="px-3 py-2.5 text-center text-xs font-medium text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-semibold text-slate-900 truncate">{row.handle_name}</span>
                              {row.channel_link && (
                                <a href={row.channel_link} target="_blank" rel="noopener noreferrer"
                                  className="shrink-0 text-slate-400 hover:text-blue-500 transition-colors" title="Open profile">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 capitalize text-xs">{row.platform}</td>
                          <td className="px-3 py-2.5"><span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full whitespace-nowrap">{row.category}</span></td>
                          <td className="px-3 py-2.5 text-slate-600 text-xs">{row.followers}</td>
                          <td className="px-3 py-2.5"><span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{row.deliverable_type}</span></td>
                          <td className="px-3 py-2.5 text-center text-slate-700 font-medium">{row.quantity}</td>
                          <td className="px-3 py-2.5 text-right text-slate-500 text-xs">₹{Number(row.rate).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2.5 text-right text-slate-700 font-medium text-xs">₹{Number(row.total_cost).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2.5 text-right text-blue-600 font-medium text-xs bg-blue-50/30">₹{Number(row.client_rate).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2.5 text-right text-blue-700 font-bold text-xs bg-blue-50/30">₹{Number(row.client_total).toLocaleString("en-IN")}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-center text-xs font-medium text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1 min-w-0">
                              <input value={row.handle_name} onChange={e => updateRow(i, "handle_name", e.target.value)}
                                className="flex-1 min-w-0 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 font-semibold text-slate-900 text-sm" />
                              {row.channel_link ? (
                                <a href={row.channel_link} target="_blank" rel="noopener noreferrer"
                                  className="shrink-0 text-slate-400 hover:text-blue-500 transition-colors" title={row.channel_link}>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <input value={row.channel_link || ""} onChange={e => updateRow(i, "channel_link", e.target.value)}
                                  placeholder="↗ url"
                                  className="w-10 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-xs text-slate-400 shrink-0" />
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2"><input value={row.platform} onChange={e => updateRow(i, "platform", e.target.value)} className="w-20 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-xs text-slate-600 capitalize" /></td>
                          <td className="px-3 py-2"><input value={row.category} onChange={e => updateRow(i, "category", e.target.value)} className="w-24 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-xs text-slate-600" /></td>
                          <td className="px-3 py-2"><input value={row.followers} onChange={e => updateRow(i, "followers", e.target.value)} className="w-16 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-xs text-slate-600" /></td>
                          <td className="px-3 py-2"><input value={row.deliverable_type} onChange={e => updateRow(i, "deliverable_type", e.target.value)} className="w-20 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-xs text-slate-600" /></td>
                          <td className="px-3 py-2 text-center"><input type="number" value={row.quantity} onChange={e => updateRow(i, "quantity", Number(e.target.value))} className="w-10 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-center text-slate-700 font-medium" /></td>
                          <td className="px-3 py-2 text-right"><input type="number" value={row.rate} onChange={e => updateRow(i, "rate", Number(e.target.value))} className="w-20 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 text-right text-slate-600 text-xs" /></td>
                          <td className="px-3 py-2 text-right text-slate-700 font-medium text-xs">₹{Number(row.total_cost).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2 text-right text-blue-600 font-medium text-xs bg-blue-50/30">₹{Number(row.client_rate).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2 text-right text-blue-700 font-bold text-xs bg-blue-50/30">₹{Number(row.client_total).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2"><button onClick={() => removeRow(i)} className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 p-1 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={9} className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">Agency Total</td>
                    <td className="px-3 py-2.5 font-bold text-slate-700">₹{totalAgencyCost().toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-blue-600 text-right">Client Quote</td>
                    <td className="px-3 py-2.5 font-bold text-blue-700">₹{totalClientQuote().toLocaleString("en-IN")}</td>
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
              <button onClick={exportToGoogleDoc} disabled={exportingDoc}
                className="flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                {exportingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                {exportingDoc ? "Exporting…" : "Export to Google Docs"}
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

      {/* ── Discovery Options Modal ──────────────────────────────────────── */}
      {showDiscoveryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-slate-900">Discovery Settings</h3>
              </div>
              <button onClick={() => setShowDiscoveryModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <div className="p-5 space-y-5">

              {/* Brief context pill — auto-pulled from campaign brief */}
              {(brief.industry || brief.campaign_type || brief.target_audience) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 space-y-0.5">
                  <p className="font-semibold mb-1 text-amber-900">From your campaign brief — discovery will be tailored to:</p>
                  {brief.industry && <p>· Industry: <strong>{brief.industry}</strong></p>}
                  {brief.campaign_type && <p>· Campaign type: <strong>{brief.campaign_type}</strong></p>}
                  {brief.target_audience && <p>· Audience: <strong>{brief.target_audience}</strong></p>}
                  {brief.campaign_objective && <p>· Objective: <strong>{brief.campaign_objective.slice(0, 80)}{brief.campaign_objective.length > 80 ? "…" : ""}</strong></p>}
                </div>
              )}

              {/* Platforms */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Platforms to Search</p>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_PLATFORMS.map(p => (
                    <label key={p.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${discoveryPlatforms.includes(p.id) ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <input type="checkbox" checked={discoveryPlatforms.includes(p.id)} onChange={() => togglePlatform(p.id)} className="accent-amber-500 w-4 h-4" />
                      <span className="text-sm font-medium text-slate-700">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Content type */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Content Type</p>
                <div className="flex gap-2">
                  {([
                    { v: "creators", l: "Creators / Influencers" },
                    { v: "pages", l: "Community Pages" },
                    { v: "both", l: "Both" },
                  ] as const).map(({ v, l }) => (
                    <button key={v} onClick={() => setDiscoveryContentType(v)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${discoveryContentType === v ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Geography / Language (optional) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Regional / Language Filter</p>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Optional</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  If selected, discovery will return <strong>only regional creators and pages</strong> who create content for that geography or in that language. Leave blank for national-level results.
                </p>

                {/* Toggle: State or Language */}
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-3">
                  <button
                    onClick={() => setDiscoveryGeoMode("state")}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${discoveryGeoMode === "state" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    By State / City
                  </button>
                  <button
                    onClick={() => setDiscoveryGeoMode("language")}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${discoveryGeoMode === "language" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    By Language
                  </button>
                </div>

                {discoveryGeoMode === "state" ? (
                  <div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {INDIAN_STATES.map(s => (
                        <button
                          key={s}
                          onClick={() => setDiscoveryGeos(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                          className={`text-left px-3 py-1.5 rounded-lg text-sm border-2 transition-all ${discoveryGeos.includes(s) ? "border-amber-400 bg-amber-50 text-amber-800 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                    {discoveryGeos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {discoveryGeos.map(g => (
                          <span key={g} className="flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-medium">
                            {g}
                            <button onClick={() => setDiscoveryGeos(prev => prev.filter(x => x !== g))} className="hover:text-amber-900">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <button onClick={() => setDiscoveryGeos([])} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">
                          Clear all
                        </button>
                      </div>
                    )}
                    {discoveryGeos.length > 0 && (
                      <p className="text-xs text-amber-700 mt-2 bg-amber-50 px-3 py-2 rounded-lg">
                        Discovery will focus on creators based in or primarily covering <strong>{discoveryGeos.join(", ")}</strong>.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-3 gap-2">
                      {INDIAN_LANGUAGES.map(lang => (
                        <button
                          key={lang}
                          onClick={() => setDiscoveryLanguages(prev => prev.includes(lang) ? prev.filter(x => x !== lang) : [...prev, lang])}
                          className={`py-2 px-3 rounded-xl text-sm font-medium border-2 transition-all ${discoveryLanguages.includes(lang) ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                          {lang}
                        </button>
                      ))}
                    </div>
                    {discoveryLanguages.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {discoveryLanguages.map(l => (
                          <span key={l} className="flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-medium">
                            {l}
                            <button onClick={() => setDiscoveryLanguages(prev => prev.filter(x => x !== l))} className="hover:text-amber-900">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <button onClick={() => setDiscoveryLanguages([])} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">
                          Clear all
                        </button>
                      </div>
                    )}
                    {discoveryLanguages.length > 0 && (
                      <p className="text-xs text-amber-700 mt-2 bg-amber-50 px-3 py-2 rounded-lg">
                        Discovery will return creators making content in <strong>{discoveryLanguages.join(", ")}</strong>.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Creator / Page Size Segments */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Creator / Page Size</p>
                <p className="text-xs text-slate-400 mb-3">Select which follower tiers to include (multi-select)</p>
                <div className="space-y-2">
                  {[
                    { id: "nano",  label: "Nano",  range: "5K – 25K followers",   color: "blue" },
                    { id: "micro", label: "Micro", range: "25K – 2L followers",    color: "amber" },
                    { id: "macro", label: "Macro", range: "Above 2L followers",    color: "violet" },
                  ].map(seg => {
                    const checked = discoverySegments.includes(seg.id);
                    return (
                      <label key={seg.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${checked ? `border-${seg.color}-400 bg-${seg.color}-50` : "border-slate-200 hover:border-slate-300"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setDiscoverySegments(prev =>
                            prev.includes(seg.id) ? prev.filter(s => s !== seg.id) : [...prev, seg.id]
                          )}
                          className={`w-4 h-4 accent-${seg.color}-500`}
                        />
                        <div>
                          <p className={`text-sm font-semibold ${checked ? `text-${seg.color}-700` : "text-slate-700"}`}>{seg.label}</p>
                          <p className="text-xs text-slate-400">{seg.range}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {discoverySegments.length === 0 && (
                  <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg mt-2">Select at least one size segment.</p>
                )}
              </div>

              {discoveryPlatforms.length === 0 && (
                <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">Select at least one platform to search.</p>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-100 sticky bottom-0 bg-white">
              <button onClick={() => setShowDiscoveryModal(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={runDiscovery} disabled={discoveryPlatforms.length === 0 || discoverySegments.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                <Search className="w-4 h-4" />
                {(discoveryGeos.length > 0 || discoveryLanguages.length > 0)
                  ? `Search ${[...discoveryGeos, ...discoveryLanguages].join(" + ")} creators`
                  : "Start Discovery"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Margin Modal ─────────────────────────────────────────────────── */}
      {showMarginModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-blue-500" />
                <h3 className="font-semibold text-slate-900">Agency Margin</h3>
              </div>
              <button onClick={() => setShowMarginModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">
                The <strong>total budget (₹{Number(brief.total_budget || 0).toLocaleString("en-IN")})</strong> entered in the brief is the <strong>client-facing amount — inclusive of your margin</strong>. Enter your margin below and we'll reverse-calculate what gets spent on media.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-2">Agency Margin %</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min={0} max={100} value={pendingMargin}
                    onChange={e => setPendingMargin(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { const m = Math.min(100, Math.max(0, Number(pendingMargin) || 0)); setAgencyMargin(m); generatePlan(m); } }}
                    className="flex-1 px-4 py-3 text-2xl font-bold text-center border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <span className="text-2xl font-bold text-slate-400">%</span>
                </div>
                <div className="flex gap-2 mt-3">
                  {[20, 25, 30, 35, 40].map(m => (
                    <button key={m} onClick={() => setPendingMargin(String(m))}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${pendingMargin === String(m) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
                      {m}%
                    </button>
                  ))}
                </div>
              </div>
              {pendingMargin && brief.total_budget && (
                (() => {
                  const budget = Number(brief.total_budget) || 0;
                  const m = Number(pendingMargin) || 0;
                  const agencySpend = Math.round(budget / (1 + m / 100));
                  const agencyEarning = budget - agencySpend;
                  return (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Client pays (budget)</span>
                        <span className="font-bold text-slate-800">₹{budget.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Spent on media / pages</span>
                        <span className="font-semibold text-blue-700">₹{agencySpend.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between border-t border-blue-200 pt-2">
                        <span className="text-slate-600">Agency earning ({m}%)</span>
                        <span className="font-bold text-emerald-700">₹{agencyEarning.toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setShowMarginModal(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button
                onClick={() => { const m = Math.min(100, Math.max(0, Number(pendingMargin) || 0)); setAgencyMargin(m); generatePlan(m); }}
                disabled={!pendingMargin || Number(pendingMargin) < 0 || Number(pendingMargin) > 100}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                <Wand2 className="w-4 h-4" /> Generate Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Retainer Monthly Plans ──────────────────────────────────────── */}
      {brief.engagement_model === "retainer" && crmId && brief.retainer_start_month && (
        <RetainerPlansSection
          briefId={crmId}
          brandName={brief.brand_name || "Retainer Client"}
          pagesPolicy={brief.retainer_pages_policy}
          retainerStatus={retainerStatus}
          startMonth={brief.retainer_start_month}
          brief={brief as unknown as Record<string, unknown>}
          userId={retainerUserId}
          onRetainerStatusChange={setRetainerStatus}
          onPolicyChange={p => sb("retainer_pages_policy", p)}
        />
      )}
      {brief.engagement_model === "retainer" && crmId && !brief.retainer_start_month && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 text-sm text-violet-700">
          Set a <strong>Retainer Start Month</strong> above and save the brief to manage monthly plans.
        </div>
      )}

      {/* ── Manual Plan Builder ──────────────────────────────────────────── */}
      {showManualBuilder && (
        <ManualPlanBuilder
          agencyMargin={agencyMargin}
          onAdd={(rows) => {
            setPlanRows(prev => [...prev, ...rows]);
            setShowPlan(true);
            setShowManualBuilder(false);
          }}
          onClose={() => setShowManualBuilder(false)}
        />
      )}

      {/* ── WhatsApp Modal ───────────────────────────────────────────────── */}
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
                WhatsApp Business API integration pending. Once connected, this will send a campaign brief to all contacts above.
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowWhatsApp(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button disabled className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg opacity-60 cursor-not-allowed">
                <MessageCircle className="w-4 h-4" /> Send via WhatsApp (Pending)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
