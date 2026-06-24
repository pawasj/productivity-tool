"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Share2, Plus, X, Loader2, ExternalLink, Copy, Check, Trash2 } from "lucide-react";
import type { Vertical, SocialPlatformData } from "@/lib/types";

const PLATFORMS = ["Instagram", "YouTube", "LinkedIn", "Facebook", "Twitter/X", "Threads", "Snapchat"];

interface Client { id: string; name: string; vertical_id?: string; }
interface ReportEntry {
  id: string; client_name: string; period_from: string; period_to: string;
  platforms: SocialPlatformData[]; share_token: string; created_at: string; analysis?: string;
}
interface Props { verticals: Vertical[]; userId: string; }

const EMPTY_PLATFORM: SocialPlatformData = {
  platform: "Instagram", followers: undefined, posts: undefined,
  reach: undefined, impressions: undefined, engagements: undefined,
  engagement_rate: undefined, video_views: undefined, new_followers: undefined,
};

export default function SocialMediaReport({ verticals, userId }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [form, setForm] = useState({
    client_id: "", client_name: "",
    period_from: "", period_to: "",
    platforms: [{ ...EMPTY_PLATFORM }] as SocialPlatformData[],
  });

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from("clients").select("id, name, vertical_id").order("name"),
      supabase.from("social_media_reports").select("id, client_name, period_from, period_to, platforms, share_token, created_at, analysis").order("created_at", { ascending: false }),
    ]);
    setClients((c || []) as Client[]);
    setReports((r || []) as ReportEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function addPlatform() { setForm(f => ({ ...f, platforms: [...f.platforms, { ...EMPTY_PLATFORM }] })); }
  function removePlatform(i: number) { setForm(f => ({ ...f, platforms: f.platforms.filter((_, idx) => idx !== i) })); }
  function updatePlatform(i: number, field: keyof SocialPlatformData, val: string | number | undefined) {
    setForm(f => ({ ...f, platforms: f.platforms.map((p, idx) => idx === i ? { ...p, [field]: val } : p) }));
  }

  async function generate() {
    if (!form.client_name || !form.period_from || !form.period_to || form.platforms.length === 0) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/reports/social-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: form.client_id || null,
          client_name: form.client_name,
          period_from: form.period_from,
          period_to: form.period_to,
          platforms: form.platforms,
          created_by: userId,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { alert(json.error || "Generation failed"); return; }
      setShowForm(false);
      setForm({ client_id: "", client_name: "", period_from: "", period_to: "", platforms: [{ ...EMPTY_PLATFORM }] });
      load();
      window.open(`/report/${json.share_token}`, "_blank");
    } catch { alert("Unexpected error. Try again."); }
    finally { setGenerating(false); }
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
          <p className="text-sm text-slate-400 mt-0.5">Generate shareable reports for clients with AI analysis</p>
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
                    {(r.platforms || []).map((p: SocialPlatformData) => (
                      <span key={p.platform} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{p.platform}</span>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-slate-900">New Social Media Report</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Client */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Client *</label>
                <select value={form.client_id}
                  onChange={e => {
                    const client = clients.find(c => c.id === e.target.value);
                    setForm(f => ({ ...f, client_id: e.target.value, client_name: client?.name || "" }));
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select client (or type below)</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {!form.client_id && (
                  <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                    placeholder="Or type client name manually"
                    className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                )}
              </div>

              {/* Period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Period From *</label>
                  <input type="date" value={form.period_from} onChange={e => setForm(f => ({ ...f, period_from: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Period To *</label>
                  <input type="date" value={form.period_to} onChange={e => setForm(f => ({ ...f, period_to: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* Platform metrics */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Platform Metrics</label>
                  <button onClick={addPlatform} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
                    <Plus className="w-3.5 h-3.5" /> Add Platform
                  </button>
                </div>
                {form.platforms.map((p, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-4 mb-3 relative">
                    {form.platforms.length > 1 && (
                      <button onClick={() => removePlatform(i)} className="absolute top-3 right-3 text-slate-300 hover:text-rose-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <select value={p.platform} onChange={e => updatePlatform(i, "platform", e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      {PLATFORMS.map(pl => <option key={pl} value={pl}>{pl}</option>)}
                    </select>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { key: "followers", label: "Followers" },
                        { key: "new_followers", label: "New Followers" },
                        { key: "posts", label: "Posts Published" },
                        { key: "reach", label: "Total Reach" },
                        { key: "impressions", label: "Impressions" },
                        { key: "engagements", label: "Engagements" },
                        { key: "engagement_rate", label: "Eng. Rate (%)" },
                        { key: "video_views", label: "Video Views" },
                        { key: "top_post_reach", label: "Top Post Reach" },
                      ] as { key: keyof SocialPlatformData; label: string }[]).map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
                          <input type="number" value={p[key] ?? ""}
                            onChange={e => updatePlatform(i, key, e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="—"
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={generate} disabled={generating || !form.client_name || !form.period_from || !form.period_to}
                className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {generating ? "Generating Report…" : "Generate & Open Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
