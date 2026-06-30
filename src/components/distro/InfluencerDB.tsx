"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Search, Upload, Plus, X, Check, Edit2, RefreshCw, Users, Globe } from "lucide-react";
import Papa from "papaparse";
import type { Influencer } from "@/lib/types";

const ALL_CATEGORIES = [
  "Startups", "Memes", "Pop Culture", "News", "Regional", "Motivational",
  "Clips", "Community", "Politics", "Cinema / OTT", "Cricket / Sports",
  "Music", "Devotional", "Other",
];

const CREATOR_CATEGORIES = ALL_CATEGORIES;
const PAGE_CATEGORIES = ALL_CATEGORIES;

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "reddit", label: "Reddit" },
  { value: "x", label: "X (Twitter)" },
  { value: "newsletter", label: "Newsletter" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
];

const RATE_FIELDS = [
  { key: "rate_post", label: "Post" },
  { key: "rate_story", label: "Story" },
  { key: "rate_reel", label: "Reel" },
  { key: "rate_carousel", label: "Carousel" },
  { key: "rate_combo", label: "Combo" },
  { key: "rate_collab_post", label: "Collab" },
] as const;

function fmt(n?: number | null) {
  if (!n) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

/** Strip currency symbols, commas, spaces → parse as number. Returns null if zero or unparseable. */
function parseRate(raw: string | undefined): number | null {
  if (!raw) return null;
  // Remove ₹ $ € £ commas spaces then parse
  const cleaned = raw.toString().replace(/[₹$€£,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) || n === 0 ? null : Math.round(n);
}

function parseFollowers(s: string): number {
  if (!s) return 0;
  // Remove commas, currency symbols, spaces first
  const clean = s.toString().replace(/[,₹$€£\s]/g, "").trim().toUpperCase();
  if (clean.endsWith("M")) return Math.round(parseFloat(clean) * 1_000_000);
  if (clean.endsWith("K")) return Math.round(parseFloat(clean) * 1_000);
  const n = parseInt(clean.replace(/[^0-9]/g, "")) || 0;
  return n;
}

const PLATFORM_MAP: Record<string, string> = {
  instagram: "instagram", insta: "instagram", ig: "instagram",
  youtube: "youtube", yt: "youtube", "youtube shorts": "youtube",
  linkedin: "linkedin", li: "linkedin",
  x: "x", twitter: "x", tw: "x",
  reddit: "reddit",
  newsletter: "newsletter", substack: "newsletter", email: "newsletter",
  website: "website", blog: "website", web: "website",
  other: "other",
};

function normalisePlatform(raw: string): string {
  const key = raw.toString().toLowerCase().trim();
  return PLATFORM_MAP[key] || key || "instagram";
}

function normaliseOwned(raw: string): boolean {
  const v = raw.toString().toLowerCase().trim();
  return ["owned", "yes", "true", "1", "y", "own", "✓", "x", "bcc"].includes(v);
}

const EMPTY = (type: "creator" | "page"): Partial<Influencer & { influencer_type: string }> => ({
  handle_name: "", channel_link: "",
  category: type === "creator" ? CREATOR_CATEGORIES[0] : PAGE_CATEGORIES[0],
  platform: "instagram", followers: undefined,
  rate_post: undefined, rate_story: undefined, rate_reel: undefined,
  rate_carousel: undefined, rate_combo: undefined, rate_collab_post: undefined,
  contact_no: "", person_name: "", location: "", state: "",
  is_owned: false,
  influencer_type: type,
});

interface Props {
  subtype: "creator" | "page";
}

export function InfluencerTable({ subtype }: Props) {
  const [items, setItems] = useState<(Influencer & { influencer_type?: string })[]>([]);
  const [filtered, setFiltered] = useState<(Influencer & { influencer_type?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [platFilter, setPlatFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [ownedFilter, setOwnedFilter] = useState(false);
  const [allStates, setAllStates] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Influencer & { influencer_type: string }>>(EMPTY(subtype));
  const [formType, setFormType] = useState<"creator" | "page">(subtype);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<"add" | "replace" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const categories = subtype === "creator" ? CREATOR_CATEGORIES : PAGE_CATEGORIES;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("influencers")
      .select("*")
      .eq("is_active", true)
      .eq("influencer_type", subtype)
      .order("handle_name");
    const rows = (data || []) as (Influencer & { influencer_type?: string })[];
    setItems(rows);
    const states = [...new Set(rows.map(r => r.state).filter(Boolean))] as string[];
    setAllStates(states.sort());
    setLoading(false);
  }, [subtype, supabase]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let r = items;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(i => i.handle_name.toLowerCase().includes(q) || i.person_name?.toLowerCase().includes(q) || i.state?.toLowerCase().includes(q) || i.location?.toLowerCase().includes(q));
    }
    if (catFilter) r = r.filter(i => i.category === catFilter);
    if (platFilter) r = r.filter(i => i.platform === platFilter);
    if (stateFilter) r = r.filter(i => i.state === stateFilter);
    if (ownedFilter) r = r.filter(i => i.is_owned);
    setFiltered(r);
  }, [search, catFilter, platFilter, stateFilter, ownedFilter, items]);

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const mode = importMode;
    setImporting(true); setImportMsg(""); setShowImportModal(false); setImportMode(null);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const rows = res.data as Record<string, string>[];

        // Replace All: delete every existing row for this subtype first
        if (mode === "replace") {
          const { data: existing } = await supabase
            .from("influencers")
            .select("id")
            .eq("influencer_type", subtype);
          if (existing?.length) {
            await supabase.from("influencers").delete().eq("influencer_type", subtype);
          }
        }

        let added = 0, updated = 0;
        for (const row of rows) {
          const handle = (row["Handle Name"] || row["handle_name"] || row["Handle"] || row["Page Name"] || row["page_name"] || "").trim();
          if (!handle) continue;
          const platform = normalisePlatform(row["Platform"] || row["platform"] || "instagram");
          const record = {
            handle_name: handle,
            channel_link: (row["Channel link"] || row["Channel Link"] || row["channel_link"] || row["Link"] || row["URL"] || row["url"] || "").trim(),
            category: (row["Category"] || row["category"] || row["Niche"] || row["niche"] || categories[0]).trim(),
            platform,
            followers: parseFollowers(row["Followers"] || row["followers"] || row["Followers Count"] || "0"),
            rate_post:       parseRate(row["Rate card of Post"] || row["rate_post"]      || row["Post"]        || row["Post Rate"]),
            rate_story:      parseRate(row["Story"]             || row["rate_story"]     || row["Story Rate"]),
            rate_combo:      parseRate(row["Combo"]             || row["rate_combo"]     || row["Combo Rate"]),
            rate_reel:       parseRate(row["Reel"]              || row["rate_reel"]      || row["Reel Rate"]),
            rate_carousel:   parseRate(row["Carousel"]          || row["rate_carousel"]  || row["Carousel Rate"]),
            rate_collab_post:parseRate(row["Collab Post"]       || row["rate_collab_post"]|| row["Collab"]     || row["Collab Rate"]),
            contact_no: (row["Contact No."] || row["contact_no"] || row["Contact"] || row["Phone"] || row["phone"] || "").trim(),
            person_name: (row["Person Name"] || row["person_name"] || row["Name"] || row["POC"] || "").trim(),
            location: (row["Location"] || row["location"] || row["City"] || row["city"] || "").trim(),
            state: (row["State"] || row["state"] || "").trim(),
            is_owned: normaliseOwned(row["Status"] || row["status"] || row["Owned"] || row["owned"] || ""),
            influencer_type: subtype,
          };
          if (mode === "replace") {
            await supabase.from("influencers").insert(record);
            added++;
          } else {
            const { data: ex } = await supabase.from("influencers").select("id").eq("handle_name", record.handle_name).eq("platform", platform).single();
            if (ex) { await supabase.from("influencers").update(record).eq("id", ex.id); updated++; }
            else { await supabase.from("influencers").insert(record); added++; }
          }
        }
        setImportMsg(mode === "replace"
          ? `✓ Database replaced — ${added} entries imported`
          : `✓ ${added} added, ${updated} updated`);
        setImporting(false);
        load();
        if (fileRef.current) fileRef.current.value = "";
      },
    });
  }

  function sf<K extends keyof (Influencer & { influencer_type: string })>(k: K, v: unknown) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.handle_name?.trim()) return;
    setSaving(true);
    const record = { ...form, influencer_type: editingId ? formType : subtype };
    if (editingId) {
      const { data } = await supabase.from("influencers").update(record).eq("id", editingId).select().single();
      if (data) {
        // If type changed, remove from current list (it now belongs to the other tab)
        if (formType !== subtype) setItems(items.filter(i => i.id !== editingId));
        else setItems(items.map(i => i.id === editingId ? data as Influencer & { influencer_type?: string } : i));
      }
    } else {
      const { data } = await supabase.from("influencers").insert(record).select().single();
      if (data) setItems([data as Influencer & { influencer_type?: string }, ...items]);
    }
    setSaving(false); setShowForm(false); setEditingId(null); setForm(EMPTY(subtype)); setFormType(subtype);
  }

  function openEdit(inf: Influencer & { influencer_type?: string }) {
    setEditingId(inf.id);
    setForm(inf);
    setFormType((inf.influencer_type as "creator" | "page") || subtype);
    setShowForm(true);
  }

  async function remove(id: string) {
    await supabase.from("influencers").update({ is_active: false }).eq("id", id);
    setItems(items.filter(i => i.id !== id));
  }

  const platLabel = (p: string) => PLATFORMS.find(pl => pl.value === p)?.label || p;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${subtype === "creator" ? "creators" : "pages"}…`}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={platFilter} onChange={e => setPlatFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All platforms</option>
          {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All states</option>
          {allStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={() => setOwnedFilter(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
            ownedFilter
              ? "bg-emerald-600 text-white border-emerald-600"
              : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}>
          🏠 {ownedFilter ? "Owned Only" : "All Media"}
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
        <button onClick={() => setShowImportModal(true)} disabled={importing}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors disabled:opacity-60">
          {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Import CSV
        </button>
        <button onClick={() => { setForm(EMPTY(subtype)); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Add {subtype === "creator" ? "Creator" : "Page"}
        </button>
      </div>

      {importMsg && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex justify-between">
          {importMsg} <button onClick={() => setImportMsg("")}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Handle</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Owned</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Platform</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Followers</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Post ₹</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reel ₹</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Story ₹</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Carousel ₹</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Collab ₹</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Combo ₹</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">State</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && <tr><td colSpan={14} className="text-center py-10 text-slate-400">Loading…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={14} className="text-center py-10 text-slate-400">
                  No {subtype === "creator" ? "creators" : "pages"} yet. Import a CSV or add manually.
                </td></tr>
              )}
              {filtered.map(inf => (
                <tr key={inf.id} className={`hover:bg-slate-50 group transition-colors ${inf.is_owned ? "bg-emerald-50/40" : ""}`}>
                  <td className="px-4 py-3">
                    <a href={inf.channel_link || "#"} target="_blank" rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:underline">{inf.handle_name}</a>
                    {inf.person_name && <p className="text-xs text-slate-400 mt-0.5">{inf.person_name}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {inf.is_owned
                      ? <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">🏠 Owned</span>
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{platLabel(inf.platform || "")}</td>
                  <td className="px-4 py-3">
                    <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full">{inf.category || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmt(inf.followers)}</td>
                  <td className="px-4 py-3 text-slate-600">{inf.rate_post ? `₹${Number(inf.rate_post).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{inf.rate_reel ? `₹${Number(inf.rate_reel).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{inf.rate_story ? `₹${Number(inf.rate_story).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{inf.rate_carousel ? `₹${Number(inf.rate_carousel).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{inf.rate_collab_post ? `₹${Number(inf.rate_collab_post).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{inf.rate_combo ? `₹${Number(inf.rate_combo).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{inf.contact_no || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{inf.state || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(inf)} className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(inf.id)} className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
            {filtered.length} of {items.length} {subtype === "creator" ? "creators" : "pages"}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">{editingId ? "Edit" : "Add"} Entry</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {/* Type toggle — only shown when editing */}
              {editingId && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">List Type</label>
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
                    {(["creator", "page"] as const).map(t => (
                      <button key={t} onClick={() => setFormType(t)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${formType === t ? "bg-white shadow text-blue-700" : "text-slate-500 hover:text-slate-700"}`}>
                        {t === "creator" ? "👤 Creator" : "📄 Community Page"}
                      </button>
                    ))}
                  </div>
                  {formType !== subtype && (
                    <p className="text-xs text-amber-600 mt-1.5">This entry will move to the <strong>{formType === "creator" ? "Creators" : "Community Pages"}</strong> list on save.</p>
                  )}
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Handle Name *</label>
                <input value={form.handle_name || ""} onChange={e => sf("handle_name", e.target.value)} placeholder="@handle"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Channel Link</label>
                <input value={form.channel_link || ""} onChange={e => sf("channel_link", e.target.value)} placeholder="https://..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Platform</label>
                <select value={form.platform || "instagram"} onChange={e => sf("platform", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <select value={form.category || ""} onChange={e => sf("category", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Followers</label>
                <input value={form.followers || ""} onChange={e => sf("followers", parseFollowers(e.target.value) || undefined)} placeholder="e.g. 1.2M"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-2">Rate Card (₹)</label>
                <div className="grid grid-cols-3 gap-2">
                  {RATE_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs text-slate-500 mb-1">{label}</label>
                      <input type="number" value={(form as Record<string, unknown>)[key] as number || ""}
                        onChange={e => sf(key as keyof Influencer, parseFloat(e.target.value) || undefined)}
                        placeholder="0" className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Person / Account Manager</label>
                <input value={form.person_name || ""} onChange={e => sf("person_name", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Contact No. (WhatsApp)</label>
                <input value={form.contact_no || ""} onChange={e => sf("contact_no", e.target.value)} placeholder="+91..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">City / Location</label>
                <input value={form.location || ""} onChange={e => sf("location", e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">State</label>
                <input value={form.state || ""} onChange={e => sf("state", e.target.value)} placeholder="e.g. Maharashtra"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${form.is_owned ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="checkbox"
                    checked={!!form.is_owned}
                    onChange={e => sf("is_owned", e.target.checked)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-800">🏠 Owned Media</span>
                    <p className="text-xs text-slate-400 mt-0.5">This page is managed in-house by BCC Media Network</p>
                  </div>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={save} disabled={saving || !form.handle_name?.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving…" : <><Check className="w-3.5 h-3.5" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import mode modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Import CSV</h3>
            <p className="text-sm text-slate-500 mb-5">How should this CSV be imported?</p>
            <div className="space-y-3 mb-6">
              <button
                onClick={() => { setImportMode("add"); setShowImportModal(false); fileRef.current?.click(); }}
                className="w-full text-left px-4 py-3 border-2 border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors group"
              >
                <p className="font-semibold text-slate-800 group-hover:text-blue-700">Add New</p>
                <p className="text-xs text-slate-500 mt-0.5">Add entries from the CSV to the existing database. Existing entries with the same handle will be updated with new rates. Nothing else is deleted.</p>
              </button>
              <button
                onClick={() => { setImportMode("replace"); setShowImportModal(false); fileRef.current?.click(); }}
                className="w-full text-left px-4 py-3 border-2 border-slate-200 rounded-xl hover:border-red-400 hover:bg-red-50 transition-colors group"
              >
                <p className="font-semibold text-slate-800 group-hover:text-red-700">Replace All</p>
                <p className="text-xs text-slate-500 mt-0.5">Delete the entire existing database for this tab and replace it completely with the CSV. This cannot be undone.</p>
              </button>
            </div>
            <button onClick={() => setShowImportModal(false)} className="w-full text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InfluencerDB() {
  const [tab, setTab] = useState<"creator" | "page">("creator");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setTab("creator")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "creator" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          <Users className="w-4 h-4" /> Creators & Influencers
        </button>
        <button onClick={() => setTab("page")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === "page" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          <Globe className="w-4 h-4" /> Community Pages
        </button>
        <span className="ml-2 text-xs text-slate-400">Each tab has its own CSV import — data is stored separately</span>
      </div>
      <InfluencerTable key={tab} subtype={tab} />
    </div>
  );
}
