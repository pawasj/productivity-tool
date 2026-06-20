"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { StickyNote, Plus, X, Pin, PinOff, Edit3, Check } from "lucide-react";
import type { Note } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface Props { verticalId: string; userId: string; }

const NOTE_COLORS = [
  "bg-yellow-50 border-yellow-200",
  "bg-blue-50 border-blue-200",
  "bg-green-50 border-green-200",
  "bg-purple-50 border-purple-200",
  "bg-rose-50 border-rose-200",
];

export default function NotesModule({ verticalId, userId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => { fetchNotes(); }, [verticalId]);

  async function fetchNotes() {
    const { data } = await supabase
      .from("notes")
      .select("*")
      .eq("vertical_id", verticalId)
      .eq("user_id", userId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    setNotes((data || []) as Note[]);
  }

  async function saveNote() {
    if (!content.trim()) return;
    setSaving(true);
    if (editingId) {
      const { data } = await supabase.from("notes").update({ title, content, updated_at: new Date().toISOString() }).eq("id", editingId).select().single();
      if (data) setNotes(notes.map((n) => n.id === editingId ? data as Note : n));
      setEditingId(null);
    } else {
      const { data } = await supabase.from("notes").insert({ vertical_id: verticalId, user_id: userId, title, content, pinned: false }).select().single();
      if (data) setNotes([data as Note, ...notes]);
      setShowForm(false);
    }
    setSaving(false);
    setTitle(""); setContent("");
  }

  async function togglePin(note: Note) {
    const { data } = await supabase.from("notes").update({ pinned: !note.pinned }).eq("id", note.id).select().single();
    if (data) {
      const updated = notes.map((n) => n.id === note.id ? data as Note : n);
      setNotes(updated.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)));
    }
  }

  async function deleteNote(id: string) {
    await supabase.from("notes").delete().eq("id", id);
    setNotes(notes.filter((n) => n.id !== id));
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setShowForm(false);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-yellow-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Important Notes</h3>
          <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-1.5 py-0.5 rounded-full">{notes.length}</span>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setTitle(""); setContent(""); }} className="p-1.5 hover:bg-yellow-50 rounded-lg transition-colors text-yellow-600">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {(showForm || editingId) && (
        <div className="p-3 border-b border-slate-100 bg-yellow-50 animate-fade-in">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title (optional)…"
            className="w-full px-3 py-2 border border-yellow-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white mb-2" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note…"
            rows={3}
            autoFocus
            className="w-full px-3 py-2 border border-yellow-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white resize-none mb-2" />
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="flex-1 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={saveNote} disabled={saving || !content.trim()} className="flex-1 py-1.5 text-xs bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : editingId ? "Update" : "Add Note"}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto p-3 space-y-2">
        {notes.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No notes yet
          </div>
        )}
        {notes.map((note, i) => (
          <div key={note.id} className={`p-3 rounded-lg border group relative ${NOTE_COLORS[i % NOTE_COLORS.length]}`}>
            {note.title && <p className="text-xs font-semibold text-slate-700 mb-1">{note.title}</p>}
            <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{note.content}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-400">{formatDate(note.updated_at)}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => togglePin(note)} className="p-1 hover:bg-white/80 rounded transition-colors">
                  {note.pinned ? <PinOff className="w-3 h-3 text-slate-500" /> : <Pin className="w-3 h-3 text-slate-500" />}
                </button>
                <button onClick={() => startEdit(note)} className="p-1 hover:bg-white/80 rounded transition-colors">
                  <Edit3 className="w-3 h-3 text-slate-500" />
                </button>
                <button onClick={() => deleteNote(note.id)} className="p-1 hover:bg-rose-100 rounded transition-colors">
                  <X className="w-3 h-3 text-rose-500" />
                </button>
              </div>
            </div>
            {note.pinned && <Pin className="absolute top-2 right-2 w-3 h-3 text-indigo-400" />}
          </div>
        ))}
      </div>
    </div>
  );
}
