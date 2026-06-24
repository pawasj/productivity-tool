"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { Search, X, Plus, Minus, Check, Database } from "lucide-react";
import type { Influencer, PlanRow } from "@/lib/types";

interface SelectedConfig {
  deliverable_type: string;
  quantity: number;
  rate: number;
}

interface Props {
  agencyMargin: number;
  onAdd: (rows: PlanRow[]) => void;
  onClose: () => void;
}

const DELIVERABLE_TYPES = ["Reel", "Post", "Story", "Carousel", "Video", "Thread", "Article", "Podcast", "Newsletter", "Combo"];
const PLATFORMS = ["instagram", "youtube", "linkedin", "reddit", "x", "newsletter", "website", "other"];

function fmtFollowers(n?: number | null) {
  if (!n) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

function bestRate(inf: Influencer): number {
  return inf.rate_reel || inf.rate_post || inf.rate_carousel || inf.rate_combo || inf.rate_story || inf.rate_collab_post || 0;
}

export default function ManualPlanBuilder({ agencyMargin, onAdd, onClose }: Props) {
  const [items, setItems] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platFilter, setPlatFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "creator" | "page">("");
  const [selected, setSelected] = useState<Record<string, SelectedConfig>>({});
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("influencers").select("*").eq("is_active", true).order("handle_name");
      setItems((data || []) as Influencer[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => items.filter(inf => {
    const matchSearch = !search || inf.handle_name?.toLowerCase().includes(search.toLowerCase()) ||
      inf.category?.toLowerCase().includes(search.toLowerCase()) || inf.location?.toLowerCase().includes(search.toLowerCase());
    const matchPlat = !platFilter || inf.platform === platFilter;
    const matchType = !typeFilter || (inf as Influencer & { influencer_type?: string }).influencer_type === typeFilter;
    return matchSearch && matchPlat && matchType;
  }), [items, search, platFilter, typeFilter]);

  function toggle(inf: Influencer) {
    setSelected(prev => {
      if (prev[inf.id]) {
        const next = { ...prev };
        delete next[inf.id];
        return next;
      }
      return {
        ...prev,
        [inf.id]: {
          deliverable_type: "Reel",
          quantity: 1,
          rate: bestRate(inf),
        },
      };
    });
  }

  function updateConfig(id: string, field: keyof SelectedConfig, val: string | number) {
    setSelected(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  }

  function handleAdd() {
    const rows: PlanRow[] = Object.entries(selected).map(([id, cfg]) => {
      const inf = items.find(i => i.id === id)!;
      const qty = Number(cfg.quantity) || 1;
      const rate = Number(cfg.rate) || 0;
      const totalCost = qty * rate;
      const clientRate = Math.round(rate * (1 + agencyMargin / 100));
      const clientTotal = qty * clientRate;
      return {
        handle_name: inf.handle_name,
        platform: inf.platform,
        category: inf.category || "",
        followers: fmtFollowers(inf.followers),
        deliverable_type: cfg.deliverable_type,
        quantity: qty,
        rate,
        total_cost: totalCost,
        client_rate: clientRate,
        client_total: clientTotal,
        contact_no: inf.contact_no || "",
        channel_link: inf.channel_link || "",
      };
    });
    onAdd(rows);
  }

  const selectedIds = Object.keys(selected);
  const selectedItems = selectedIds.map(id => ({ id, inf: items.find(i => i.id === id)!, cfg: selected[id] })).filter(x => x.inf);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
              <Database className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Build Media Plan from Database</h2>
              <p className="text-xs text-slate-500">Select creators and pages, set deliverables and rates</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Database list */}
          <div className="flex-1 flex flex-col border-r border-slate-100 overflow-hidden">
            {/* Filters */}
            <div className="px-4 py-3 border-b border-slate-100 flex gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search handles, categories…"
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as "" | "creator" | "page")}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-600">
                <option value="">All Types</option>
                <option value="creator">Creators</option>
                <option value="page">Pages</option>
              </select>
              <select value={platFilter} onChange={e => setPlatFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-600">
                <option value="">All Platforms</option>
                {PLATFORMS.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading database…</div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No entries match your filters</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Handle</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Platform</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Category</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Followers</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Best Rate</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(inf => {
                      const isSelected = Boolean(selected[inf.id]);
                      return (
                        <tr key={inf.id} onClick={() => toggle(inf)}
                          className={`cursor-pointer transition-colors hover:bg-teal-50 ${isSelected ? "bg-teal-50" : ""}`}>
                          <td className="px-3 py-2.5">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-teal-600 border-teal-600" : "border-slate-300"}`}>
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-900">{inf.handle_name}</td>
                          <td className="px-3 py-2.5 text-slate-600 capitalize">{inf.platform}</td>
                          <td className="px-3 py-2.5 text-slate-600">{inf.category || "—"}</td>
                          <td className="px-3 py-2.5 text-slate-600">{fmtFollowers(inf.followers)}</td>
                          <td className="px-3 py-2.5 text-slate-700">{bestRate(inf) ? `₹${bestRate(inf).toLocaleString("en-IN")}` : "—"}</td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{inf.state || inf.location || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100 shrink-0">
              {filtered.length} entries · {selectedIds.length} selected
            </div>
          </div>

          {/* Right: Selected items config */}
          <div className="w-80 flex flex-col bg-slate-50 shrink-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 shrink-0">
              <p className="text-sm font-semibold text-slate-900">Selected ({selectedIds.length})</p>
              <p className="text-xs text-slate-500 mt-0.5">Set deliverable type, quantity & rate</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {selectedItems.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Plus className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Click rows on the left to select</p>
                </div>
              ) : (
                selectedItems.map(({ id, inf, cfg }) => (
                  <div key={id} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 leading-tight">{inf.handle_name}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{inf.platform} · {fmtFollowers(inf.followers)}</p>
                      </div>
                      <button onClick={() => toggle(inf)} className="p-1 text-slate-400 hover:text-rose-500 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium uppercase">Deliverable</label>
                        <select value={cfg.deliverable_type} onChange={e => updateConfig(id, "deliverable_type", e.target.value)}
                          className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-teal-500">
                          {DELIVERABLE_TYPES.map(d => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium uppercase">Quantity</label>
                        <div className="flex items-center gap-1 mt-0.5">
                          <button onClick={() => updateConfig(id, "quantity", Math.max(1, cfg.quantity - 1))} className="w-6 h-6 border border-slate-200 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="flex-1 text-center text-sm font-medium">{cfg.quantity}</span>
                          <button onClick={() => updateConfig(id, "quantity", cfg.quantity + 1)} className="w-6 h-6 border border-slate-200 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-medium uppercase">Agency Rate (₹)</label>
                      <input type="number" value={cfg.rate} onChange={e => updateConfig(id, "rate", Number(e.target.value))}
                        className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal-500" />
                      {cfg.rate > 0 && (
                        <p className="text-[10px] text-blue-600 mt-0.5">
                          Client: ₹{Math.round(cfg.rate * (1 + agencyMargin / 100)).toLocaleString("en-IN")} (+{agencyMargin}%) · Total: ₹{(cfg.quantity * Math.round(cfg.rate * (1 + agencyMargin / 100))).toLocaleString("en-IN")}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-slate-100 shrink-0 space-y-2">
              {selectedIds.length > 0 && (
                <div className="text-xs text-slate-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <p className="font-medium text-blue-700">
                    Client Quote: ₹{selectedItems.reduce((s, { inf: _inf, cfg }) => s + cfg.quantity * Math.round(cfg.rate * (1 + agencyMargin / 100)), 0).toLocaleString("en-IN")}
                  </p>
                  <p className="text-blue-600 mt-0.5">
                    Agency: ₹{selectedItems.reduce((s, { inf: _inf, cfg }) => s + cfg.quantity * cfg.rate, 0).toLocaleString("en-IN")} · {agencyMargin}% margin
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
                <button onClick={handleAdd} disabled={selectedIds.length === 0}
                  className="flex-1 py-2 text-sm bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors">
                  Add {selectedIds.length > 0 ? `${selectedIds.length} to Plan` : "to Plan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
