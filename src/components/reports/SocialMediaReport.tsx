"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import {
  Share2, Plus, X, Loader2, ExternalLink, Copy, Check, Trash2,
  Upload, Sparkles, ChevronDown, ImageIcon, AlertCircle,
} from "lucide-react";
import type { Vertical } from "@/lib/types";

const PRESET_PLATFORMS = [
  "Instagram", "LinkedIn", "YouTube", "Facebook", "Twitter/X",
  "Threads", "Snapchat", "TikTok", "Pinterest", "Other",
];

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: "#E1306C", YouTube: "#FF0000", LinkedIn: "#0A66C2",
  Facebook: "#1877F2", "Twitter/X": "#000000", Threads: "#101010",
  Snapchat: "#FFFC00", TikTok: "#010101", Pinterest: "#E60023",
};

interface Client { id: string; name: string; vertical_id?: string; }
interface ReportEntry {
  id: string; client_name: string; period_from: string; period_to: string;
  platforms: { platform: string }[]; share_token: string; created_at: string;
}
interface UploadedImage { file: File; base64: string; mediaType: string; preview: string; }
interface PlatformEntry {
  id: string;
  preset: string;
  customName: string;
  images: UploadedImage[];
}

interface Props { verticals: Vertical[]; userId: string; }

function uid() { return Math.random().toString(36).slice(2); }
function makePlatform(preset = "Instagram"): PlatformEntry {
  return { id: uid(), preset, customName: "", images: [] };
}

export default function SocialMediaReport({ verticals, userId }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientVertical, setClientVertical] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [platforms, setPlatforms] = useState<PlatformEntry[]>([makePlatform("Instagram"), makePlatform("LinkedIn")]);

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from("clients").select("id, name, vertical_id").order("name"),
      supabase.from("social_media_reports")
        .select("id, client_name, period_from, period_to, platforms, share_token, created_at")
        .order("created_at", { ascending: false }),
    ]);
    setClients((c || []) as Client[]);
    setReports((r || []) as ReportEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function addPlatform() {
    const usedPresets = platforms.map(p => p.preset);
    const next = PRESET_PLATFORMS.find(p => !usedPresets.includes(p) && p !== "Other") || "Other";
    setPlatforms(p => [...p, makePlatform(next)]);
  }

  function removePlatform(id: string) { setPlatforms(p => p.filter(x => x.id !== id)); }

  function updatePlatform(id: string, field: keyof PlatformEntry, val: string) {
    setPlatforms(p => p.map(x => x.id === id ? { ...x, [field]: val } : x));
  }

  async function handleImageUpload(platformId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newImages: UploadedImage[] = await Promise.all(files.map(file => new Promise<UploadedImage>(resolve => {
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        resolve({
          file,
          base64: dataUrl.split(",")[1],
          mediaType: file.type || "image/jpeg",
          preview: dataUrl,
        });
      };
      reader.readAsDataURL(file);
    })));
    setPlatforms(p => p.map(x => x.id === platformId ? { ...x, images: [...x.images, ...newImages] } : x));
    if (fileRefs.current[platformId]) fileRefs.current[platformId]!.value = "";
  }

  function removeImage(platformId: string, imgIdx: number) {
    setPlatforms(p => p.map(x => x.id === platformId ? { ...x, images: x.images.filter((_, i) => i !== imgIdx) } : x));
  }

  function platformDisplayName(p: PlatformEntry) {
    return p.preset === "Other" ? (p.customName || "Custom Platform") : p.preset;
  }

  const totalImages = platforms.reduce((sum, p) => sum + p.images.length, 0);
  const canGenerate = clientName && periodFrom && periodTo && platforms.length > 0 && totalImages > 0;

  async function generate() {
    if (!canGenerate) return;
    setGenerating(true);
    setGenerateStatus("Sending screenshots to AI…");
    try {
      const selectedClient = clients.find(c => c.id === clientId);
      const verticalName = clientVertical
        || (selectedClient?.vertical_id ? verticals.find(v => v.id === selectedClient.vertical_id)?.name : "")
        || "";

      setGenerateStatus("Extracting metrics and analysing…");
      const res = await fetch("/api/reports/social-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId || null,
          client_name: clientName,
          client_vertical: verticalName,
          period_from: periodFrom,
          period_to: periodTo,
          created_by: userId,
          platforms: platforms.map(p => ({
            name: platformDisplayName(p),
            screenshots: p.images.map(img => ({ base64: img.base64, mediaType: img.mediaType })),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { alert(json.error || "Generation failed"); return; }
      setShowForm(false);
      resetForm();
      load();
      window.open(`/report/${json.share_token}`, "_blank");
    } catch { alert("Unexpected error. Please try again."); }
    finally { setGenerating(false); setGenerateStatus(""); }
  }

  function resetForm() {
    setClientId(""); setClientName(""); setClientVertical("");
    setPeriodFrom(""); setPeriodTo("");
    setPlatforms([makePlatform("Instagram"), makePlatform("LinkedIn")]);
  }

  async function deleteReport(id: string) {
    if (!confirm("Delete this report?")) return;
    await supabase.from("social_media_reports").delete().eq("id", id);
    setReports(r => r.filter(x => x.id !== id));
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/report/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Social Media Reports</h2>
          <p className="text-sm text-slate-400 mt-0.5">Upload screenshots per platform — AI extracts metrics and generates a deep, shareable report</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Report
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <Share2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No social media reports yet</p>
          <p className="text-xs mt-1">Create one to generate a shareable report for your client</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{r.client_name}</h3>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {new Date(r.period_from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} —{" "}
                    {new Date(r.period_to).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {(r.platforms || []).map((p, i) => (
                      <span key={i} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        {(p as { platform: string }).platform}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => copyLink(r.share_token)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">
                    {copied === r.share_token ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied === r.share_token ? "Copied!" : "Copy Link"}
                  </button>
                  <a href={`/report/${r.share_token}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    <ExternalLink className="w-3.5 h-3.5" /> Open Report
                  </a>
                  <button onClick={() => deleteReport(r.id)} className="text-slate-300 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Report Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="font-semibold text-slate-900">New Social Media Report</h3>
                <p className="text-xs text-slate-400 mt-0.5">Add platforms, upload screenshots — AI does the rest</p>
              </div>
              <button onClick={() => { setShowForm(false); resetForm(); }}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Client */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Client *</label>
                  <select value={clientId}
                    onChange={e => {
                      const client = clients.find(c => c.id === e.target.value);
                      setClientId(e.target.value);
                      setClientName(client?.name || "");
                      if (client?.vertical_id) {
                        const v = verticals.find(v => v.id === client.vertical_id);
                        setClientVertical(v?.name || "");
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select client…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {!clientId && (
                    <input value={clientName} onChange={e => setClientName(e.target.value)}
                      placeholder="Or type client name"
                      className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Industry / Vertical</label>
                  <select value={clientVertical} onChange={e => setClientVertical(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select (for benchmarks)</option>
                    {verticals.map(v => <option key={v.id} value={v.name}>{v.icon} {v.name}</option>)}
                    <option value="FMCG">FMCG / Consumer Goods</option>
                    <option value="Fashion">Fashion & Lifestyle</option>
                    <option value="Technology">Technology</option>
                    <option value="Finance">Finance & Banking</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Education">Education</option>
                    <option value="Real Estate">Real Estate</option>
                    <option value="Travel & Hospitality">Travel & Hospitality</option>
                    <option value="Food & Beverage">Food & Beverage</option>
                    <option value="Entertainment">Entertainment</option>
                  </select>
                </div>
              </div>

              {/* Period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Period From *</label>
                  <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Period To *</label>
                  <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* Platforms */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Platforms</label>
                  <button onClick={addPlatform}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    <Plus className="w-3.5 h-3.5" /> Add Platform
                  </button>
                </div>

                <div className="space-y-3">
                  {platforms.map(p => (
                    <PlatformCard
                      key={p.id}
                      platform={p}
                      fileRef={el => { fileRefs.current[p.id] = el; }}
                      onPresetChange={val => updatePlatform(p.id, "preset", val)}
                      onCustomNameChange={val => updatePlatform(p.id, "customName", val)}
                      onUpload={e => handleImageUpload(p.id, e)}
                      onRemoveImage={idx => removeImage(p.id, idx)}
                      onRemovePlatform={() => removePlatform(p.id)}
                      canRemove={platforms.length > 1}
                    />
                  ))}
                </div>

                {totalImages === 0 && (
                  <div className="flex items-center gap-2 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700">Upload at least one screenshot to any platform to generate the report.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
              <button onClick={() => { setShowForm(false); resetForm(); }}
                className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button onClick={generate} disabled={generating || !canGenerate}
                className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{generateStatus || "Generating…"}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlatformCard({
  platform, fileRef, onPresetChange, onCustomNameChange,
  onUpload, onRemoveImage, onRemovePlatform, canRemove,
}: {
  platform: PlatformEntry;
  fileRef: (el: HTMLInputElement | null) => void;
  onPresetChange: (v: string) => void;
  onCustomNameChange: (v: string) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (idx: number) => void;
  onRemovePlatform: () => void;
  canRemove: boolean;
}) {
  const color = PLATFORM_COLORS[platform.preset] || "#6366f1";
  const displayName = platform.preset === "Other" ? (platform.customName || "Custom Platform") : platform.preset;
  const localRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Platform header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
          style={{ background: color }}>
          {displayName.charAt(0)}
        </div>
        <div className="flex gap-2 flex-1">
          <div className="relative">
            <select value={platform.preset} onChange={e => onPresetChange(e.target.value)}
              className="appearance-none pl-3 pr-7 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium">
              {PRESET_PLATFORMS.map(pl => <option key={pl} value={pl}>{pl}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          {platform.preset === "Other" && (
            <input value={platform.customName} onChange={e => onCustomNameChange(e.target.value)}
              placeholder="Platform name"
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          )}
        </div>
        <span className="text-xs text-slate-400 shrink-0">
          {platform.images.length} screenshot{platform.images.length !== 1 ? "s" : ""}
        </span>
        {canRemove && (
          <button onClick={onRemovePlatform} className="text-slate-300 hover:text-rose-500 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Upload area */}
      <div className="p-3">
        <input
          type="file" multiple accept="image/*" className="hidden"
          ref={el => { localRef.current = el; fileRef(el); }}
          onChange={onUpload}
        />

        {platform.images.length === 0 ? (
          <div
            onClick={() => localRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-lg p-5 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
            <Upload className="w-6 h-6 mx-auto text-slate-300 mb-1.5" />
            <p className="text-sm text-slate-500 font-medium">Click to add screenshots</p>
            <p className="text-xs text-slate-400 mt-0.5">Upload analytics dashboards, insights screenshots, post stats</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {platform.images.map((img, idx) => (
                <div key={idx} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt="" className="w-20 h-14 object-cover rounded-lg border border-slate-200" />
                  <button
                    onClick={() => onRemoveImage(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => localRef.current?.click()}
                className="w-20 h-14 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer text-slate-400">
                <Plus className="w-4 h-4" />
                <span className="text-[10px] mt-0.5">Add</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              AI will extract and collate all metrics from these {platform.images.length} screenshot{platform.images.length > 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
