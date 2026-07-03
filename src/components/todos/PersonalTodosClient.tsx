"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  ListTodo, Plus, X, Check, Circle, Loader2, Trash2, Calendar, Flag,
  Search, PhoneCall,
} from "lucide-react";
import type { Todo, Vertical } from "@/lib/types";
import { PRIORITY_COLORS, formatDate } from "@/lib/utils";

const supabase = createClient();

type ExtTodo = Todo & { kind?: string; vertical?: Vertical };

interface Props { userId: string; verticals: Vertical[]; }

const EMPTY_FORM = {
  title: "", kind: "todo" as "todo" | "follow_up", description: "",
  priority: "medium" as "low" | "medium" | "high", due_date: "", vertical_id: "",
};

export default function PersonalTodosClient({ userId, verticals }: Props) {
  const [todos, setTodos] = useState<ExtTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<"" | "todo" | "follow_up">("");
  const [filterVertical, setFilterVertical] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState<"pending" | "done" | "all">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("todos")
      .select("*, vertical:verticals(id,name,color,icon)")
      .eq("user_id", userId)
      .is("assigned_to", null)   // personal items only — assigned tasks live in the Tasks panel
      .order("created_at", { ascending: false });
    setTodos((data || []) as ExtTodo[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!form.title.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("todos").insert({
      title: form.title.trim(),
      kind: form.kind,
      description: form.description || null,
      priority: form.priority,
      due_date: form.due_date || null,
      vertical_id: form.vertical_id || (verticals[0]?.id ?? null),
      user_id: userId,
      completed: false,
    }).select("*, vertical:verticals(id,name,color,icon)").single();
    setSaving(false);
    if (error) { alert(`Failed to add: ${error.message}`); return; }
    if (data) setTodos(prev => [data as ExtTodo, ...prev]);
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
  }

  async function toggle(t: ExtTodo) {
    setTodos(prev => prev.map(x => x.id === t.id ? { ...x, completed: !t.completed } : x));
    const { error } = await supabase.from("todos").update({ completed: !t.completed }).eq("id", t.id);
    if (error) setTodos(prev => prev.map(x => x.id === t.id ? { ...x, completed: t.completed } : x));
  }

  async function remove(id: string) {
    if (!confirm("Delete this item?")) return;
    await supabase.from("todos").delete().eq("id", id);
    setTodos(prev => prev.filter(x => x.id !== id));
  }

  const filtered = todos.filter(t => {
    if (filterStatus === "pending" && t.completed) return false;
    if (filterStatus === "done" && !t.completed) return false;
    if (filterKind && (t.kind || "todo") !== filterKind) return false;
    if (filterVertical && t.vertical_id !== filterVertical) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pending = filtered.filter(t => !t.completed);
  const done = filtered.filter(t => t.completed);
  const overdue = pending.filter(t => t.due_date && new Date(t.due_date) < new Date());

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow-sm">
              <ListTodo className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">My To-Dos</h1>
              <p className="text-sm text-slate-400">
                Personal to-dos & follow-ups · {pending.length} pending
                {overdue.length > 0 && <span className="text-rose-500"> · {overdue.length} overdue</span>}
              </p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 shadow-sm">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 w-44" />
          </div>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            {(["pending", "all", "done"] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${filterStatus === s ? "bg-white shadow text-teal-700" : "text-slate-500 hover:text-slate-700"}`}>
                {s}
              </button>
            ))}
          </div>
          <select value={filterKind} onChange={e => setFilterKind(e.target.value as typeof filterKind)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">To-dos & Follow-ups</option>
            <option value="todo">To-dos only</option>
            <option value="follow_up">Follow-ups only</option>
          </select>
          <select value={filterVertical} onChange={e => setFilterVertical(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">All Verticals</option>
            {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Nothing here — add a to-do or follow-up</p>
          </div>
        ) : (
          <>
            {pending.map(t => <Row key={t.id} t={t} onToggle={toggle} onDelete={remove} />)}
            {done.length > 0 && (
              <>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-3 pb-1">Completed ({done.length})</p>
                {done.map(t => <Row key={t.id} t={t} onToggle={toggle} onDelete={remove} />)}
              </>
            )}
          </>
        )}
      </div>

      {/* Add Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">New {form.kind === "follow_up" ? "Follow-up" : "To-Do"}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button onClick={() => setForm(f => ({ ...f, kind: "todo" }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${form.kind === "todo" ? "bg-white shadow text-teal-700" : "text-slate-500"}`}>
                  <ListTodo className="w-3.5 h-3.5" /> To-Do
                </button>
                <button onClick={() => setForm(f => ({ ...f, kind: "follow_up" }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${form.kind === "follow_up" ? "bg-white shadow text-teal-700" : "text-slate-500"}`}>
                  <PhoneCall className="w-3.5 h-3.5" /> Follow-up
                </button>
              </div>
              <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={form.kind === "follow_up" ? "Follow up with…" : "What needs doing?"}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                onKeyDown={e => e.key === "Enter" && add()} />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Notes (optional)" rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Vertical</label>
                  <select value={form.vertical_id} onChange={e => setForm(f => ({ ...f, vertical_id: e.target.value }))}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">General</option>
                    {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as typeof form.priority }))}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Deadline</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={add} disabled={saving || !form.title.trim()}
                className="flex-1 py-2.5 text-sm bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ t, onToggle, onDelete }: { t: ExtTodo; onToggle: (t: ExtTodo) => void; onDelete: (id: string) => void }) {
  const isOverdue = !t.completed && t.due_date && new Date(t.due_date) < new Date();
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3.5 flex items-start gap-3 group transition-all ${isOverdue ? "border-rose-200 bg-rose-50/30" : "border-slate-200"}`}>
      <button onClick={() => onToggle(t)} className="mt-0.5 shrink-0">
        {t.completed
          ? <Check className="w-5 h-5 text-emerald-500" />
          : <Circle className={`w-5 h-5 ${isOverdue ? "text-rose-400" : "text-slate-300 group-hover:text-teal-400"} transition-colors`} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${t.completed ? "line-through text-slate-400" : "text-slate-800"}`}>{t.title}</p>
        {t.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{t.description}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {(t.kind || "todo") === "follow_up" && (
            <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <PhoneCall className="w-2.5 h-2.5" /> Follow-up
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[t.priority]}`}>
            <Flag className="w-2.5 h-2.5 inline mr-0.5" />{t.priority}
          </span>
          {t.due_date && (
            <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
              <Calendar className="w-3 h-3" />{formatDate(t.due_date)}{isOverdue && " · Overdue"}
            </span>
          )}
          {t.vertical && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${t.vertical.color}20`, color: t.vertical.color }}>
              {t.vertical.icon} {t.vertical.name}
            </span>
          )}
        </div>
      </div>
      <button onClick={() => onDelete(t.id)} className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-all text-slate-300">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
