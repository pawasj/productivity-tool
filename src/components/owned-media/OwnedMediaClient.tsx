"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Radio, Plus, X, Loader2, RefreshCw, Pencil, Trash2, Globe, Mail,
  LayoutGrid, CalendarDays, Users,
} from "lucide-react";
import { CONTENT_CATEGORIES } from "@/lib/types";
import type { OwnedMediaProperty, OwnedMediaPlatform } from "@/lib/types";

type IconProps = { className?: string; style?: React.CSSProperties };

const InstagramIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);
const LinkedinIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
  </svg>
);
const YoutubeIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" /><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
  </svg>
);
const RedditIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="13.5" r="7.5" /><circle cx="9" cy="13" r="0.5" fill="currentColor" /><circle cx="15" cy="13" r="0.5" fill="currentColor" />
    <path d="M9.5 16.5c1.5 1 3.5 1 5 0" /><path d="M12 6l1-3.5 3 .8" /><circle cx="16.5" cy="3.5" r="1" /><circle cx="4" cy="10" r="1.5" /><circle cx="20" cy="10" r="1.5" />
  </svg>
);

const PLATFORMS: { key: OwnedMediaPlatform; label: string; icon: React.ComponentType<IconProps>; color: string }[] = [
  { key: "instagram", label: "Instagram", icon: InstagramIcon, color: "#E1306C" },
  { key: "linkedin", label: "LinkedIn", icon: LinkedinIcon, color: "#0A66C2" },
  { key: "youtube", label: "YouTube", icon: YoutubeIcon, color: "#FF0000" },
  { key: "website", label: "Website", icon: Globe, color: "#475569" },
  { key: "reddit", label: "Reddit", icon: RedditIcon, color: "#FF4500" },
  { key: "substack", label: "Substack", icon: Mail, color: "#FF6719" },
];

const METRIC_PLATFORMS = PLATFORMS.filter(p => p.key !== "website");

const CADENCE_FIELDS = ["posts", "reels", "carousels", "stories", "articles", "newsletters", "videos"];

const TEAM_ROLES: { key: string; label: string }[] = [
  { key: "page_admin", label: "Page Admin" },
  { key: "content", label: "Content" },
  { key: "manager", label: "Manager" },
  { key: "design", label: "Design" },
  { key: "video_editing", label: "Video Editing" },
];
const PRICING_FIELDS = ["post", "reel", "story", "collab", "carousel", "newsletter", "video"];

const CATEGORIES = [...CONTENT_CATEGORIES];

const COUNTRIES = [
  "India", "USA", "UK", "UAE", "Canada", "Australia", "Singapore",
  "Germany", "France", "Netherlands", "Saudi Arabia", "Indonesia",
  "Philippines", "Global", "Other",
];

interface FormState {
  id?: string;
  name: string;
  category: string;
  country: string;
  links: Record<string, string>;
  metrics: Record<string, string>;
  cadence: Record<string, string>;
  pricing: Record<string, string>;
  team: Record<string, string>;
  is_active: boolean;
  notes: string;
}
const EMPTY_FORM: FormState = { name: "", category: "", country: "", links: {}, metrics: {}, cadence: {}, pricing: {}, team: {}, is_active: true, notes: "" };

function fmtNum(n?: number) {
  if (!n) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}
function fmtPrice(n?: number) { return n ? `₹${n.toLocaleString("en-IN")}` : null; }

export default function OwnedMediaClient({ members = [] }: { members?: { id: string; full_name: string }[] }) {
  const [tab, setTab] = useState<"properties" | "cadence" | "team">("properties");
  const [countryFilter, setCountryFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [teamFilters, setTeamFilters] = useState<Record<string, string>>({});
  const [props, setProps] = useState<OwnedMediaProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/owned-media");
    const json = await res.json();
    if (json.error) setError(json.error);
    else setProps((json.data || []) as OwnedMediaProperty[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function refreshMetrics() {
    setScanning(true);
    setError("");
    try {
      const res = await fetch("/api/owned-media/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      if (json.error) setError(json.error);
      await load();
    } catch { setError("Scan failed — try again."); }
    finally { setScanning(false); }
  }

  function openNew() { setForm({ ...EMPTY_FORM, links: {}, metrics: {}, cadence: {}, pricing: {}, team: {} }); setShowForm(true); }
  function openEdit(p: OwnedMediaProperty) {
    setForm({
      id: p.id,
      name: p.name,
      category: p.category || "",
      country: p.country || "",
      links: Object.fromEntries(Object.entries(p.links || {}).map(([k, v]) => [k, String(v || "")])),
      metrics: Object.fromEntries(Object.entries(p.metrics || {}).map(([k, v]) => [k, v ? String(v) : ""])),
      cadence: Object.fromEntries(Object.entries(p.cadence || {}).map(([k, v]) => [k, v ? String(v) : ""])),
      pricing: Object.fromEntries(Object.entries(p.pricing || {}).map(([k, v]) => [k, v ? String(v) : ""])),
      team: Object.fromEntries(Object.entries(p.team || {}).map(([k, v]) => [k, String(v || "")])),
      is_active: p.is_active !== false,
      notes: p.notes || "",
    });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");
    const numRecord = (r: Record<string, string>) =>
      Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "" && !isNaN(Number(v))).map(([k, v]) => [k, Number(v)]));
    const linkRecord = Object.fromEntries(Object.entries(form.links).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, v.trim()]));

    const res = await fetch("/api/owned-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: form.id,
        name: form.name,
        category: form.category,
        country: form.country,
        links: linkRecord,
        metrics: numRecord(form.metrics),
        cadence: numRecord(form.cadence),
        pricing: numRecord(form.pricing),
        team: Object.fromEntries(Object.entries(form.team).filter(([, v]) => v)),
        is_active: form.is_active,
        notes: form.notes,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.error) { setError(json.error); return; }
    setShowForm(false);
    load();
  }

  async function remove(p: OwnedMediaProperty) {
    if (!confirm(`Delete "${p.name}"? (Its Distro Hub entries stay — remove them there if needed.)`)) return;
    await fetch("/api/owned-media", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) });
    setProps(prev => prev.filter(x => x.id !== p.id));
  }

  async function toggleActive(p: OwnedMediaProperty) {
    const next = !(p.is_active !== false);
    setProps(prev => prev.map(x => x.id === p.id ? { ...x, is_active: next } : x));
    const res = await fetch("/api/owned-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, name: p.name, category: p.category, country: p.country, links: p.links, metrics: p.metrics, cadence: p.cadence, pricing: p.pricing, team: p.team || {}, is_active: next, notes: p.notes }),
    });
    const json = await res.json();
    if (json.error) {
      setProps(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !next } : x));
      setError(json.error);
    }
  }

  function memberName(id?: string) {
    return members.find(m => m.id === id)?.full_name || "";
  }

  const countries = Array.from(new Set(props.map(p => (p.country || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const usedCategories = Array.from(new Set(props.map(p => (p.category || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const activeTeamFilters = Object.entries(teamFilters).filter(([, v]) => v);

  const visibleProps = props.filter(p => {
    if (countryFilter && (p.country || "").trim().toLowerCase() !== countryFilter.toLowerCase()) return false;
    if (categoryFilter && (p.category || "").trim() !== categoryFilter) return false;
    // Team tab: every chosen role must match that property's allocation
    for (const [role, memberId] of activeTeamFilters) {
      if ((p.team?.[role] || "") !== memberId) return false;
    }
    return true;
  }).slice().sort((a, b) => {
    // Active properties always on top; re-sorts live when a toggle flips
    const aActive = a.is_active !== false ? 0 : 1;
    const bActive = b.is_active !== false ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.name.localeCompare(b.name);
  });

  const lastScan = props.map(p => p.metrics_updated_at).filter(Boolean).sort().reverse()[0];

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-rose-500 rounded-xl flex items-center justify-center shadow-sm">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Owned Media</h1>
              <p className="text-xs text-slate-400">
                In-house properties · auto-synced to Distro Hub
                {lastScan && ` · metrics scanned ${new Date(lastScan).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refreshMetrics} disabled={scanning || props.length === 0}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning…" : "Refresh Metrics"}
            </button>
            <button onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 shadow-sm">
              <Plus className="w-4 h-4" /> Add Property
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

        {/* Tabs + country filter */}
        <div className="flex items-center gap-3 flex-wrap mt-4">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {([
            { id: "properties", label: "Properties", Icon: LayoutGrid },
            { id: "cadence", label: "Cadence / Week", Icon: CalendarDays },
            { id: "team", label: "Team Allocated", Icon: Users },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === t.id ? "bg-white shadow text-orange-700" : "text-slate-500 hover:text-slate-700"}`}>
              <t.Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
        {usedCategories.length > 0 && (
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">All Categories</option>
            {usedCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {countries.length > 0 && (
          <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {(categoryFilter || countryFilter || activeTeamFilters.length > 0) && (
          <button onClick={() => { setCategoryFilter(""); setCountryFilter(""); setTeamFilters({}); }}
            className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1.5">
            Clear filters ({visibleProps.length}/{props.length})
          </button>
        )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-orange-400" /></div>
        ) : props.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <Radio className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No owned media properties yet</p>
            <p className="text-xs mt-1">Add your in-house pages, channels and newsletters to track and monetise them.</p>
          </div>
        ) : tab === "properties" ? (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase w-12">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase sticky left-12 bg-slate-50">Property</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Category</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Links</th>
                    {METRIC_PLATFORMS.map(p => (
                      <th key={p.key} className="text-right px-3 py-3 text-xs font-semibold uppercase" style={{ color: p.color }}>
                        {p.label}
                      </th>
                    ))}
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Pricing</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Active</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleProps.map((p, i) => (
                    <tr key={p.id} className={`hover:bg-slate-50/50 group ${p.is_active === false ? "opacity-50" : ""}`}>
                      <td className="px-3 py-3 text-center text-xs font-semibold text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3 sticky left-12 bg-white group-hover:bg-slate-50/50">
                        <p className="font-semibold text-slate-900">{p.name}</p>
                        {p.notes && <p className="text-xs text-slate-400 truncate max-w-[160px]">{p.notes}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          {p.category
                            ? <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap w-fit">{p.category}</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                          {p.country && <span className="text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap w-fit">🌍 {p.country}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {PLATFORMS.filter(pl => p.links?.[pl.key]).map(pl => {
                            const Icon = pl.icon;
                            return (
                              <a key={pl.key} href={p.links[pl.key]} target="_blank" rel="noopener noreferrer"
                                title={`${pl.label}: ${p.links[pl.key]}`}
                                className="p-1.5 rounded-lg hover:scale-110 transition-transform"
                                style={{ background: `${pl.color}15` }}>
                                <Icon className="w-3.5 h-3.5" style={{ color: pl.color }} />
                              </a>
                            );
                          })}
                          {Object.keys(p.links || {}).length === 0 && <span className="text-slate-300 text-xs">—</span>}
                        </div>
                      </td>
                      {METRIC_PLATFORMS.map(pl => (
                        <td key={pl.key} className="px-3 py-3 text-right font-medium text-slate-700">
                          {p.links?.[pl.key] ? fmtNum(p.metrics?.[pl.key]) : <span className="text-slate-200">·</span>}
                        </td>
                      ))}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {PRICING_FIELDS.filter(f => p.pricing?.[f]).map(f => (
                            <span key={f} className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full whitespace-nowrap capitalize">
                              {f}: {fmtPrice(p.pricing[f])}
                            </span>
                          ))}
                          {!PRICING_FIELDS.some(f => p.pricing?.[f]) && <span className="text-slate-300 text-xs">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => toggleActive(p)} title={p.is_active !== false ? "Active — click to deactivate" : "Inactive — click to activate"}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.is_active !== false ? "bg-emerald-500" : "bg-slate-300"}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${p.is_active !== false ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => remove(p)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg" title="Delete">
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
        ) : tab === "cadence" ? (
          /* ── Cadence per week ── */
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Cadence per Week</h3>
              <p className="text-xs text-slate-400 mt-0.5">Content pieces committed per week on each property — edit via the property</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase w-12">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Property</th>
                    {CADENCE_FIELDS.map(f => (
                      <th key={f} className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase capitalize">{f}</th>
                    ))}
                    <th className="text-center px-4 py-3 text-xs font-semibold text-orange-600 uppercase">Total /wk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleProps.map((p, i) => {
                    const total = CADENCE_FIELDS.reduce((s2, f) => s2 + (Number(p.cadence?.[f]) || 0), 0);
                    return (
                      <tr key={p.id} className={`hover:bg-slate-50/50 ${p.is_active === false ? "opacity-50" : ""}`}>
                        <td className="px-3 py-3 text-center text-xs font-semibold text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                        {CADENCE_FIELDS.map(f => (
                          <td key={f} className="px-3 py-3 text-center">
                            {p.cadence?.[f]
                              ? <span className="inline-block min-w-[28px] text-sm font-bold text-slate-700 bg-slate-100 rounded-lg px-2 py-0.5">{p.cadence[f]}</span>
                              : <span className="text-slate-200">·</span>}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center font-bold text-orange-700">{total || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── Team allocated ── */
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Team Allocated</h3>
              <p className="text-xs text-slate-400 mt-0.5">Who runs what — set while adding or editing a property</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase align-top w-12">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase align-top">Property</th>
                    {TEAM_ROLES.map(r => {
                      // Only offer members actually allocated to this role
                      const roleMembers = members.filter(m => props.some(p => p.team?.[r.key] === m.id));
                      return (
                        <th key={r.key} className="text-left px-3 py-3 align-top">
                          <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">{r.label}</p>
                          <select value={teamFilters[r.key] || ""}
                            onChange={e => setTeamFilters(f => ({ ...f, [r.key]: e.target.value }))}
                            className={`w-full px-2 py-1 border rounded-lg text-[11px] font-normal normal-case focus:outline-none focus:ring-1 focus:ring-orange-400 ${teamFilters[r.key] ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500"}`}>
                            <option value="">Anyone</option>
                            {roleMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                          </select>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleProps.length === 0 && (
                    <tr><td colSpan={TEAM_ROLES.length + 2} className="px-4 py-10 text-center text-sm text-slate-400">No properties match these filters</td></tr>
                  )}
                  {visibleProps.map((p, i) => (
                    <tr key={p.id} className={`hover:bg-slate-50/50 ${p.is_active === false ? "opacity-50" : ""}`}>
                      <td className="px-3 py-3 text-center text-xs font-semibold text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                      {TEAM_ROLES.map(r => {
                        const name = memberName(p.team?.[r.key]);
                        const isFiltered = !!teamFilters[r.key] && p.team?.[r.key] === teamFilters[r.key];
                        return (
                          <td key={r.key} className={`px-3 py-3 ${isFiltered ? "bg-orange-50/60" : ""}`}>
                            {name ? (
                              <span className="flex items-center gap-1.5">
                                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {name.charAt(0).toUpperCase()}
                                </span>
                                <span className="text-xs text-slate-700">{name}</span>
                              </span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                        );
                      })}
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-semibold text-slate-900">{form.id ? "Edit Property" : "Add Owned Media Property"}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Basic */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Property Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. @desimemes"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Select category…</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Country</label>
                  <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Select country…</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Links */}
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Platform Links</p>
                <div className="grid grid-cols-2 gap-3">
                  {PLATFORMS.map(pl => {
                    const Icon = pl.icon;
                    return (
                      <div key={pl.key} className="relative">
                        <Icon className="absolute left-2.5 top-2.5 w-4 h-4" style={{ color: pl.color }} />
                        <input value={form.links[pl.key] || ""}
                          onChange={e => setForm(f => ({ ...f, links: { ...f.links, [pl.key]: e.target.value } }))}
                          placeholder={`${pl.label} URL`}
                          className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Metrics (manual) */}
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Metrics <span className="font-normal normal-case text-slate-400">(auto-scanned on Refresh · editable manually)</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {METRIC_PLATFORMS.map(pl => (
                    <div key={pl.key}>
                      <label className="block text-xs text-slate-500 mb-0.5">{pl.label} {pl.key === "youtube" || pl.key === "substack" ? "subs" : pl.key === "reddit" ? "members" : "followers"}</label>
                      <input type="number" onWheel={e => e.currentTarget.blur()} value={form.metrics[pl.key] || ""}
                        onChange={e => setForm(f => ({ ...f, metrics: { ...f.metrics, [pl.key]: e.target.value } }))}
                        placeholder="—"
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Cadence */}
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Cadence <span className="font-normal normal-case text-slate-400">(content pieces per week)</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {CADENCE_FIELDS.map(f => (
                    <div key={f}>
                      <label className="block text-xs text-slate-500 mb-0.5 capitalize">{f}</label>
                      <input type="number" onWheel={e => e.currentTarget.blur()} value={form.cadence[f] || ""}
                        onChange={e => setForm(fm => ({ ...fm, cadence: { ...fm.cadence, [f]: e.target.value } }))}
                        placeholder="0"
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing */}
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Pricing <span className="font-normal normal-case text-slate-400">(₹ per piece · syncs to Distro Hub rates)</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {PRICING_FIELDS.map(f => (
                    <div key={f}>
                      <label className="block text-xs text-slate-500 mb-0.5 capitalize">{f}</label>
                      <input type="number" onWheel={e => e.currentTarget.blur()} value={form.pricing[f] || ""}
                        onChange={e => setForm(fm => ({ ...fm, pricing: { ...fm.pricing, [f]: e.target.value } }))}
                        placeholder="₹"
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Team allocation */}
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Team Allocated <span className="font-normal normal-case text-slate-400">(shows in the Team tab)</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {TEAM_ROLES.map(r => (
                    <div key={r.key}>
                      <label className="block text-xs text-slate-500 mb-0.5">{r.label}</label>
                      <select value={form.team[r.key] || ""}
                        onChange={e => setForm(f => ({ ...f, team: { ...f.team, [r.key]: e.target.value } }))}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-400">
                        <option value="">Unassigned</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <p className="text-sm font-medium text-slate-800">Property Active</p>
                  <p className="text-xs text-slate-400">Inactive properties are dimmed and marked inactive in the Distro Hub</p>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? "bg-emerald-500" : "bg-slate-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_active ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Audience profile, monetisation notes…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
              </div>

              {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 text-sm bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? "Saving…" : form.id ? "Save Changes" : "Add & Sync to Distro Hub"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
