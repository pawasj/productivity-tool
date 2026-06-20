"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { PhoneCall, Plus, X, User, Clock } from "lucide-react";
import type { Discussion } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface Props { verticalId: string; userId: string; members: never[]; }

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
};

export default function DiscussionsModule({ verticalId, userId }: Props) {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [withPersonName, setWithPersonName] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => { fetchDiscussions(); }, [verticalId]);

  async function fetchDiscussions() {
    const { data } = await supabase
      .from("discussions")
      .select("*")
      .eq("vertical_id", verticalId)
      .order("created_at", { ascending: false });
    setDiscussions((data || []) as Discussion[]);
  }

  async function addDiscussion() {
    if (!title.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from("discussions")
      .insert({
        vertical_id: verticalId,
        created_by: userId,
        title: title.trim(),
        description: description || null,
        with_person_name: withPersonName.trim() || null,
        status: "pending",
      })
      .select("*")
      .single();
    if (data) setDiscussions([data as Discussion, ...discussions]);
    setSaving(false);
    setShowForm(false);
    setTitle(""); setDescription(""); setWithPersonName("");
  }

  async function updateStatus(id: string, status: Discussion["status"]) {
    const { data } = await supabase
      .from("discussions")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();
    if (data) setDiscussions(discussions.map((d) => (d.id === id ? data as Discussion : d)));
  }

  async function deleteDiscussion(id: string) {
    await supabase.from("discussions").delete().eq("id", id);
    setDiscussions(discussions.filter((d) => d.id !== id));
  }

  const pending = discussions.filter((d) => d.status !== "done");
  const done = discussions.filter((d) => d.status === "done");

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Pending Follow-ups</h3>
          {pending.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-medium px-1.5 py-0.5 rounded-full">{pending.length}</span>
          )}
        </div>
        <button onClick={() => setShowForm(true)} className="p-1.5 hover:bg-amber-50 rounded-lg transition-colors text-amber-600">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showForm && (
        <div className="p-3 border-b border-slate-100 bg-slate-50 animate-fade-in">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Follow-up topic…"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white mb-2"
          />
          <input
            value={withPersonName}
            onChange={(e) => setWithPersonName(e.target.value)}
            placeholder="With whom? (name, optional)"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white mb-2"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add context (optional)…"
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none mb-2"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={addDiscussion} disabled={saving || !title.trim()} className="flex-1 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors">
              {saving ? "Adding…" : "Add Follow-up"}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
        {pending.length === 0 && done.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            <PhoneCall className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No follow-ups yet
          </div>
        )}
        {pending.map((d) => (
          <DiscussionItem key={d.id} discussion={d} onStatusChange={updateStatus} onDelete={deleteDiscussion} />
        ))}
        {done.length > 0 && (
          <div className="px-4 py-1.5 bg-slate-50">
            <p className="text-xs text-slate-400 font-medium">Done ({done.length})</p>
          </div>
        )}
        {done.slice(0, 2).map((d) => (
          <DiscussionItem key={d.id} discussion={d} onStatusChange={updateStatus} onDelete={deleteDiscussion} />
        ))}
      </div>
    </div>
  );
}

function DiscussionItem({ discussion: d, onStatusChange, onDelete }: {
  discussion: Discussion;
  onStatusChange: (id: string, status: Discussion["status"]) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 group transition-colors">
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight font-medium ${d.status === "done" ? "line-through text-slate-400" : "text-slate-800"}`}>
          {d.title}
        </p>
        {d.with_person_name && (
          <div className="flex items-center gap-1 mt-0.5">
            <User className="w-3 h-3 text-slate-400" />
            <span className="text-xs text-slate-400">with {d.with_person_name}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <select
            value={d.status}
            onChange={(e) => onStatusChange(d.id, e.target.value as Discussion["status"])}
            className={`text-xs px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${STATUS_STYLES[d.status]}`}
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </div>
      </div>
      <button onClick={() => onDelete(d.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-50 hover:text-rose-500 rounded transition-all shrink-0">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
