"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical, Plus, X, Globe, Link, CheckSquare, Loader2,
  ExternalLink, ChevronRight, Search, Clock, AlertCircle, Trash2,
} from "lucide-react";

interface ReportMeta {
  id: string;
  brand_name: string;
  analysis_types: string[];
  status: "running" | "done" | "error";
  created_at: string;
  creator?: { full_name: string };
}

const ANALYSIS_OPTIONS = [
  { id: "competitor_analysis", label: "Competitor Analysis", icon: "🏆", desc: "Map competitors, SWOT, market position" },
  { id: "sentiment_analysis", label: "Sentiment Analysis", icon: "💬", desc: "Public perception, reviews, platform sentiment" },
  { id: "social_media_listening", label: "Social Media Listening", icon: "📡", desc: "Platform presence, hashtags, viral moments" },
  { id: "campaign_ideas", label: "Quirky Campaign Ideas", icon: "✨", desc: "9 creative campaign, video & content IP ideas" },
];

const TYPE_LABELS: Record<string, string> = {
  competitor_analysis: "Competitor Analysis",
  sentiment_analysis: "Sentiment Analysis",
  social_media_listening: "Social Media Listening",
  campaign_ideas: "Campaign Ideas",
};

export default function ResearchClient({ userId }: { userId: string }) {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [customType, setCustomType] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");

  const loadList = useCallback(async () => {
    setLoadingList(true);
    const res = await fetch("/api/research");
    const json = await res.json();
    setReports(json.data || []);
    setLoadingList(false);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  function toggleType(id: string) {
    setSelectedTypes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function addLink() { setLinks(prev => [...prev, ""]); }
  function updateLink(i: number, v: string) { setLinks(prev => prev.map((l, idx) => idx === i ? v : l)); }
  function removeLink(i: number) { setLinks(prev => prev.filter((_, idx) => idx !== i)); }

  async function deleteReport(id: string) {
    if (!confirm("Delete this research report?")) return;
    await fetch("/api/research", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setReports(prev => prev.filter(r => r.id !== id));
  }

  async function runResearch() {
    if (!brandName.trim() || selectedTypes.length === 0) return;
    setRunning(true);
    setRunError("");
    const cleanLinks = links.filter(l => l.trim());
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brandName.trim(), links: cleanLinks, analysis_types: selectedTypes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Research failed");

      // Open report in new tab
      window.open(`/research/${json.id}`, "_blank");
      setShowForm(false);
      setBrandName(""); setLinks([""]); setSelectedTypes([]);
      loadList();
    } catch (err) {
      setRunError(String(err));
    } finally {
      setRunning(false);
    }
  }

  function openReport(id: string) {
    window.open(`/research/${id}`, "_blank");
  }

  const estimated = selectedTypes.length * 30;

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Research Hub</h1>
              <p className="text-sm text-slate-400">AI-powered brand intelligence across the internet — grounded in real web data</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:opacity-90 shadow-sm">
            <Plus className="w-4 h-4" /> New Research
          </button>
        </div>
      </div>

      {/* Reports list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loadingList ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
        ) : reports.length === 0 ? (
          <div className="text-center py-24 text-slate-400">
            <FlaskConical className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="text-base font-medium mb-1">No research reports yet</p>
            <p className="text-sm">Run your first brand research — results are grounded in real web data</p>
            <button onClick={() => setShowForm(true)}
              className="mt-4 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700">
              Start Research
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map(r => (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => r.status === "done" && openReport(r.id)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate">{r.brand_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {r.creator?.full_name && ` · ${r.creator.full_name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    {r.status === "done" ? (
                      <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-violet-500 transition-colors" />
                    ) : r.status === "running" ? (
                      <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); deleteReport(r.id); }}
                      className="p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete report"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {r.analysis_types.map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full font-medium border border-violet-100">
                      {ANALYSIS_OPTIONS.find(o => o.id === t)?.icon} {TYPE_LABELS[t] || t}
                    </span>
                  ))}
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${r.status === "done" ? "text-emerald-600" : r.status === "running" ? "text-violet-600" : "text-rose-500"}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${r.status === "done" ? "bg-emerald-500" : r.status === "running" ? "bg-violet-400 animate-pulse" : "bg-rose-400"}`} />
                  {r.status === "done" ? "Complete — click to view" : r.status === "running" ? "Running…" : "Error"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Research Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-violet-600" />
                <h3 className="font-semibold text-slate-900">New Research</h3>
              </div>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* Brand name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Brand / Client Name *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input value={brandName} onChange={e => setBrandName(e.target.value)}
                    placeholder="e.g. Zomato, Samsung India, Bombay Shaving Company"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
              </div>

              {/* Links */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  <Globe className="w-3.5 h-3.5 inline mr-1" />
                  Relevant Links (optional — website, social handles, etc.)
                </label>
                <div className="space-y-2">
                  {links.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="relative flex-1">
                        <Link className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                        <input value={l} onChange={e => updateLink(i, e.target.value)}
                          placeholder="https://..."
                          className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                      </div>
                      {links.length > 1 && (
                        <button onClick={() => removeLink(i)} className="text-slate-300 hover:text-rose-400 p-2 rounded-lg hover:bg-rose-50">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addLink} className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium">
                    <Plus className="w-3.5 h-3.5" /> Add another link
                  </button>
                </div>
              </div>

              {/* Analysis types */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <CheckSquare className="w-3.5 h-3.5 inline mr-1" />
                  What should we research? *
                </label>
                <div className="space-y-2">
                  {ANALYSIS_OPTIONS.map(opt => (
                    <label key={opt.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedTypes.includes(opt.id) ? "border-violet-400 bg-violet-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <input type="checkbox" checked={selectedTypes.includes(opt.id)} onChange={() => toggleType(opt.id)}
                        className="accent-violet-600 mt-0.5 w-4 h-4 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{opt.icon} {opt.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Estimated time */}
              {selectedTypes.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Estimated time: ~{estimated}–{estimated + 30} seconds</p>
                    <p>AI will search the web in real-time for each selected analysis. Report opens in a new tab and is saved for future reference.</p>
                  </div>
                </div>
              )}

              {runError && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-xs text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {runError}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
              <button onClick={() => setShowForm(false)} disabled={running} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={runResearch} disabled={running || !brandName.trim() || selectedTypes.length === 0}
                className="flex-1 py-2.5 text-sm bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Researching…</> : <><FlaskConical className="w-4 h-4" /> Run Research</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
