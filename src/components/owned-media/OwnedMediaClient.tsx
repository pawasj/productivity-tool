"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Radio, Plus, X, Loader2, RefreshCw, Pencil, Trash2, Globe, Mail,
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
const PRICING_FIELDS = ["post", "reel", "story", "collab", "carousel", "newsletter", "video"];

const CATEGORIES = [...CONTENT_CATEGORIES];

interface FormState {
  id?: string;
  name: string;
  category: string;
  links: Record<string, string>;
  metrics: Record<string, string>;
  cadence: Record<string, string>;
  pricing: Record<string, string>;
  notes: string;
}
const EMPTY_FORM: FormState = { name: "", category: "", links: {}, metrics: {}, cadence: {}, pricing: {}, notes: "" };

function fmtNum(n?: number) {
  if (!n) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}
function fmtPrice(n?: number) { return n ? `₹${n.toLocaleString("en-IN")}` : null; }

export default function OwnedMediaClient() {
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

  function openNew() { setForm({ ...EMPTY_FORM, links: {}, metrics: {}, cadence: {}, pricing: {} }); setShowForm(true); }
  function openEdit(p: OwnedMediaProperty) {
    setForm({
      id: p.id,
      name: p.name,
      category: p.category || "",
      links: Object.fromEntries(Object.entries(p.links || {}).map(([k, v]) => [k, String(v || "")])),
      metrics: Object.fromEntries(Object.entries(p.metrics || {}).map(([k, v]) => [k, v ? String(v) : ""])),
      cadence: Object.fromEntries(Object.entries(p.cadence || {}).map(([k, v]) => [k, v ? String(v) : ""])),
      pricing: Object.fromEntries(Object.entries(p.pricing || {}).map(([k, v]) => [k, v ? String(v) : ""])),
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
        links: linkRecord,
        metrics: numRecord(form.metrics),
        cadence: numRecord(form.cadence),
        pricing: numRecord(form.pricing),
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
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase sticky left-0 bg-slate-50">Property</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Category</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Links</th>
                    {METRIC_PLATFORMS.map(p => (
                      <th key={p.key} className="text-right px-3 py-3 text-xs font-semibold uppercase" style={{ color: p.color }}>
                        {p.label}
                      </th>
                    ))}
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Cadence /wk</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Pricing</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {props.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50 group">
                      <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-slate-50/50">
                        <p className="font-semibold text-slate-900">{p.name}</p>
                        {p.notes && <p className="text-xs text-slate-400 truncate max-w-[160px]">{p.notes}</p>}
                      </td>
                      <td className="px-3 py-3">
                        {p.category
                          ? <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">{p.category}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
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
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {CADENCE_FIELDS.filter(f => p.cadence?.[f]).map(f => (
                            <span key={f} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              {p.cadence[f]} {f}
                            </span>
                          ))}
                          {!CADENCE_FIELDS.some(f => p.cadence?.[f]) && <span className="text-slate-300 text-xs">—</span>}
                        </div>
                      </td>
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
              <div className="grid grid-cols-2 gap-3">
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
                <div className="grid grid-cols-3 gap-3">
                  {METRIC_PLATFORMS.map(pl => (
                    <div key={pl.key}>
                      <label className="block text-xs text-slate-500 mb-0.5">{pl.label} {pl.key === "youtube" || pl.key === "substack" ? "subs" : pl.key === "reddit" ? "members" : "followers"}</label>
                      <input type="number" value={form.metrics[pl.key] || ""}
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
                <div className="grid grid-cols-4 gap-3">
                  {CADENCE_FIELDS.map(f => (
                    <div key={f}>
                      <label className="block text-xs text-slate-500 mb-0.5 capitalize">{f}</label>
                      <input type="number" value={form.cadence[f] || ""}
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
                <div className="grid grid-cols-4 gap-3">
                  {PRICING_FIELDS.map(f => (
                    <div key={f}>
                      <label className="block text-xs text-slate-500 mb-0.5 capitalize">{f}</label>
                      <input type="number" value={form.pricing[f] || ""}
                        onChange={e => setForm(fm => ({ ...fm, pricing: { ...fm.pricing, [f]: e.target.value } }))}
                        placeholder="₹"
                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
                    </div>
                  ))}
                </div>
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
