"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Lightbulb, Loader2, Trash2, Search, Send, Tag, X } from "lucide-react";
import type { Idea, Vertical } from "@/lib/types";

const supabase = createClient();

interface Props { userId: string; verticals: Vertical[]; }

const TAG_COLORS = [
  "bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700",
];
function tagColor(tag: string) {
  const hash = tag.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}

export default function IdeaDumpClient({ userId, verticals }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [verticalId, setVerticalId] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterVertical, setFilterVertical] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ideas")
      .select("*, profiles(full_name), vertical:verticals(id,name,color,icon)")
      .order("created_at", { ascending: false });
    setIdeas((data || []) as Idea[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  }

  async function add() {
    if (!content.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("ideas").insert({
      vertical_id: verticalId || (verticals[0]?.id ?? null),
      user_id: userId,
      content: content.trim(),
      tags: tags.length ? tags : null,
    }).select("*, profiles(full_name), vertical:verticals(id,name,color,icon)").single();
    setSaving(false);
    if (error) { alert(`Failed to save idea: ${error.message}`); return; }
    if (data) setIdeas(prev => [data as Idea, ...prev]);
    setContent(""); setTags([]); setTagInput("");
  }

  async function remove(id: string) {
    if (!confirm("Delete this idea?")) return;
    await supabase.from("ideas").delete().eq("id", id);
    setIdeas(prev => prev.filter(i => i.id !== id));
  }

  const filtered = ideas.filter(i => {
    if (filterVertical && i.vertical_id !== filterVertical) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.content.toLowerCase().includes(q) && !(i.tags || []).some(t => t.includes(q))) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-sm">
              <Lightbulb className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Idea Dump</h1>
              <p className="text-sm text-slate-400">Thoughts, ideas & notes across the team · {ideas.length} ideas</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ideas…"
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 w-44" />
            </div>
            <select value={filterVertical} onChange={e => setFilterVertical(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
              <option value="">All Verticals</option>
              {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
            </select>
          </div>
        </div>

        {/* Composer */}
        <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4">
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="Drop an idea, thought or note…"
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <select value={verticalId} onChange={e => setVerticalId(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
              <option value="">Select vertical…</option>
              {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
            </select>
            <div className="flex items-center gap-1 flex-1 min-w-[140px]">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
                placeholder="Add tag + Enter"
                className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
            </div>
            {tags.map(t => (
              <span key={t} className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${tagColor(t)}`}>
                #{t}
                <button onClick={() => setTags(prev => prev.filter(x => x !== t))}><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
            <button onClick={add} disabled={saving || !content.trim()}
              className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Save Idea
            </button>
          </div>
        </div>
      </div>

      {/* Idea wall */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No ideas yet — drop one above</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [column-fill:_balance]">
            {filtered.map(idea => {
              const v = (idea as Idea & { vertical?: Vertical }).vertical;
              return (
                <div key={idea.id} className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 break-inside-avoid group hover:shadow-md transition-shadow">
                  <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{idea.content}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-3">
                    {v && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${v.color}20`, color: v.color }}>
                        {v.icon} {v.name}
                      </span>
                    )}
                    {(idea.tags || []).map(t => (
                      <span key={t} className={`text-xs px-2 py-0.5 rounded-full font-medium ${tagColor(t)}`}>#{t}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-50">
                    <p className="text-xs text-slate-400">
                      {idea.profiles?.full_name?.split(" ")[0] || "—"} · {new Date(idea.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                    {idea.user_id === userId && (
                      <button onClick={() => remove(idea.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-50 hover:text-rose-500 rounded transition-all text-slate-300">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
