"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Users, Plus, X, MessageCircle, Send, ChevronDown, ChevronUp } from "lucide-react";
import type { TeamDiscussion, TeamDiscussionReply, Profile } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface Props { verticalId: string; userId: string; members: Profile[]; profile: Profile; }

export default function TeamDiscussionsModule({ verticalId, userId, members, profile }: Props) {
  const [discussions, setDiscussions] = useState<TeamDiscussion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => { fetchDiscussions(); }, [verticalId]);

  async function fetchDiscussions() {
    const { data } = await supabase
      .from("team_discussions")
      .select("*, profiles(full_name), replies:team_discussion_replies(*, profiles(full_name))")
      .eq("vertical_id", verticalId)
      .order("created_at", { ascending: false });
    setDiscussions((data || []) as TeamDiscussion[]);
  }

  async function addDiscussion() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from("team_discussions")
      .insert({ vertical_id: verticalId, created_by: userId, title: title.trim(), content: content.trim() })
      .select("*, profiles(full_name), replies:team_discussion_replies(*, profiles(full_name))")
      .single();
    if (data) setDiscussions([{ ...data as TeamDiscussion, replies: [] }, ...discussions]);
    setSaving(false);
    setShowForm(false);
    setTitle(""); setContent("");
  }

  async function deleteDiscussion(id: string) {
    await supabase.from("team_discussions").delete().eq("id", id);
    setDiscussions(discussions.filter((d) => d.id !== id));
  }

  async function addReply(discussionId: string, replyContent: string) {
    const { data } = await supabase
      .from("team_discussion_replies")
      .insert({ discussion_id: discussionId, created_by: userId, content: replyContent.trim() })
      .select("*, profiles(full_name)")
      .single();
    if (data) {
      setDiscussions(discussions.map((d) => d.id === discussionId
        ? { ...d, replies: [...(d.replies || []), data as TeamDiscussionReply] }
        : d
      ));
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Team Discussions</h3>
          <span className="bg-purple-100 text-purple-700 text-xs font-medium px-1.5 py-0.5 rounded-full">{discussions.length}</span>
        </div>
        <button onClick={() => setShowForm(true)} className="p-1.5 hover:bg-purple-50 rounded-lg transition-colors text-purple-600">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showForm && (
        <div className="p-3 border-b border-slate-100 bg-slate-50 animate-fade-in space-y-2">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Discussion title…"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)}
            placeholder="What would you like to discuss?"
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={addDiscussion} disabled={saving || !title.trim() || !content.trim()} className="flex-1 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
              {saving ? "Posting…" : "Post Discussion"}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
        {discussions.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No team discussions yet
          </div>
        )}
        {discussions.map((d) => (
          <DiscussionThread
            key={d.id} discussion={d} userId={userId} profile={profile}
            expanded={expandedId === d.id}
            onToggle={() => setExpandedId(expandedId === d.id ? null : d.id)}
            onDelete={() => deleteDiscussion(d.id)}
            onReply={(content) => addReply(d.id, content)}
          />
        ))}
      </div>
    </div>
  );
}

function DiscussionThread({ discussion: d, userId, profile, expanded, onToggle, onDelete, onReply }: {
  discussion: TeamDiscussion; userId: string; profile: Profile;
  expanded: boolean; onToggle: () => void; onDelete: () => void;
  onReply: (content: string) => void;
}) {
  const [reply, setReply] = useState("");

  return (
    <div className="px-4 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-xs shrink-0">
          {(d.profiles as Profile)?.full_name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800 truncate">{d.title}</p>
            <div className="flex items-center gap-1 shrink-0">
              {d.created_by === userId && (
                <button onClick={onDelete} className="p-1 hover:bg-rose-50 hover:text-rose-500 rounded transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
              <button onClick={onToggle} className="p-1 hover:bg-slate-100 rounded transition-colors">
                {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400">{(d.profiles as Profile)?.full_name} · {formatDateTime(d.created_at)}</p>
          {expanded && (
            <div className="mt-2 animate-fade-in">
              <p className="text-sm text-slate-600 mb-3 whitespace-pre-wrap">{d.content}</p>
              {(d.replies || []).map((r) => (
                <div key={r.id} className="flex items-start gap-2 py-2 border-t border-slate-100">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs shrink-0">
                    {(r.profiles as Profile)?.full_name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">{(r.profiles as Profile)?.full_name}</p>
                    <p className="text-xs text-slate-600">{r.content}</p>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply…"
                  className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                  onKeyDown={(e) => { if (e.key === "Enter" && reply.trim()) { onReply(reply); setReply(""); } }}
                />
                <button
                  onClick={() => { if (reply.trim()) { onReply(reply); setReply(""); } }}
                  className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
