"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Lightbulb, Plus, X, Tag } from "lucide-react";
import type { Idea } from "@/lib/types";

interface Props { verticalId: string; userId: string; }

const TAG_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function tagColor(tag: string) {
  const hash = tag.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}

export default function IdeaDumpModule({ verticalId, userId }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => { fetchIdeas(); }, [verticalId]);

  async function fetchIdeas() {
    const { data } = await supabase
      .from("ideas")
      .select("*, profiles(full_name)")
      .eq("vertical_id", verticalId)
      .order("created_at", { ascending: false });
    setIdeas((data || []) as Idea[]);
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  async function addIdea() {
    if (!content.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from("ideas")
      .insert({ vertical_id: verticalId, user_id: userId, content: content.trim(), tags: tags.length ? tags : null })
      .select("*, profiles(full_name)")
      .single();
    if (data) setIdeas([data as Idea, ...ideas]);
    setSaving(false);
    setShowForm(false);
    setContent(""); setTags([]);
  }

  async function deleteIdea(id: string) {
    await supabase.from("ideas").delete().eq("id", id);
    setIdeas(ideas.filter((i) => i.id !== id));
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-violet-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Idea Dump</h3>
          {ideas.length > 0 && (
            <span className="bg-violet-100 text-violet-700 text-xs font-medium px-1.5 py-0.5 rounded-full">{ideas.length}</span>
          )}
        </div>
        <button onClick={() => setShowForm(!showForm)} className="p-1.5 hover:bg-violet-50 rounded-lg transition-colors text-violet-600">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showForm && (
        <div className="p-3 border-b border-slate-100 bg-slate-50 animate-fade-in">
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Drop your idea here… no filter needed"
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white resize-none mb-2"
          />
          <div className="flex gap-2 mb-2">
            {tags.map((t) => (
              <span key={t} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${tagColor(t)}`}>
                {t}
                <button onClick={() => setTags(tags.filter((x) => x !== t))}><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 mb-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
              placeholder="Add tag, press Enter"
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
            />
            <button onClick={addTag} className="px-3 py-1.5 text-xs bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 transition-colors">
              <Tag className="w-3 h-3" />
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setContent(""); setTags([]); }} className="flex-1 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={addIdea} disabled={saving || !content.trim()} className="flex-1 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Dump It"}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
        {ideas.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No ideas yet. Drop anything here —</p>
            <p className="text-xs">half-baked ideas welcome!</p>
          </div>
        )}
        {ideas.map((idea) => (
          <div key={idea.id} className="px-4 py-3 hover:bg-slate-50 group transition-colors">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{idea.content}</p>
                {idea.tags && idea.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {idea.tags.map((t) => (
                      <span key={t} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tagColor(t)}`}>{t}</span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(idea.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  {idea.profiles && ` · ${(idea.profiles as { full_name: string }).full_name}`}
                </p>
              </div>
              <button onClick={() => deleteIdea(idea.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-50 hover:text-rose-500 rounded transition-all shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
