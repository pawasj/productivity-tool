"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  ListTodo, Plus, X, Check, Circle, ChevronDown, Filter,
  Loader2, Trash2, Calendar, Flag, Users, Bell,
} from "lucide-react";
import type { Todo, Vertical, Profile } from "@/lib/types";
import { PRIORITY_COLORS, formatDate } from "@/lib/utils";

const supabase = createClient();

interface Props { userId: string; verticals: Vertical[]; members: Profile[]; }

type ExtTodo = Todo & { assigned_to?: string[]; vertical?: Vertical; creator?: Profile };

const EMPTY_FORM = { title: "", description: "", priority: "medium" as const, due_date: "", vertical_id: "", assigned_to: [] as string[] };

export default function TasksClient({ userId, verticals, members }: Props) {
  const [tasks, setTasks] = useState<ExtTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "done">("pending");
  const [filterVertical, setFilterVertical] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    // Fetch via API route (service role) so RLS doesn't hide other users' / verticals' tasks
    const res = await fetch("/api/tasks");
    const json = await res.json();
    setTasks((json.data || []) as ExtTodo[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = tasks.filter(t => {
    if (filterStatus === "pending" && t.completed) return false;
    if (filterStatus === "done" && !t.completed) return false;
    if (filterVertical && t.vertical_id !== filterVertical) return false;
    if (filterAssignee) {
      if (filterAssignee === userId && t.user_id !== userId && !(t.assigned_to || []).includes(userId)) return false;
      if (filterAssignee !== userId && !(t.assigned_to || []).includes(filterAssignee) && t.user_id !== filterAssignee) return false;
    }
    return true;
  });

  async function addTask() {
    if (!form.title.trim()) return;
    setSaving(true);
    const { data } = await supabase.from("todos").insert({
      title: form.title.trim(),
      description: form.description || null,
      priority: form.priority,
      due_date: form.due_date || null,
      vertical_id: form.vertical_id || (verticals[0]?.id ?? null),
      user_id: userId,
      completed: false,
      assigned_to: form.assigned_to.length ? form.assigned_to : null,
    }).select("*, vertical:verticals(id,name,color,icon), creator:profiles!todos_user_id_fkey(id,full_name,designation)").single();
    if (data) {
      setTasks(prev => [data as ExtTodo, ...prev]);
      // Notify assigned members via in-app notification
      if (form.assigned_to.length) {
        await fetch("/api/tasks/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_title: form.title.trim(), assignee_ids: form.assigned_to, assigner_id: userId }),
        });
      }
    }
    setSaving(false);
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
  }

  async function toggleTask(t: ExtTodo) {
    // Only creator or assigned user may change status
    const canChange = t.user_id === userId || (t.assigned_to || []).includes(userId);
    if (!canChange) return;
    const { data } = await supabase.from("todos").update({ completed: !t.completed })
      .eq("id", t.id).select("*, vertical:verticals(id,name,color,icon), creator:profiles!todos_user_id_fkey(id,full_name,designation)").single();
    if (data) setTasks(prev => prev.map(x => x.id === t.id ? data as ExtTodo : x));
  }

  async function deleteTask(id: string) {
    if (!confirm("Delete this task?")) return;
    await supabase.from("todos").delete().eq("id", id);
    setTasks(prev => prev.filter(x => x.id !== id));
  }

  function toggleAssignee(id: string) {
    setForm(f => ({ ...f, assigned_to: f.assigned_to.includes(id) ? f.assigned_to.filter(x => x !== id) : [...f.assigned_to, id] }));
  }

  const pending = filtered.filter(t => !t.completed);
  const done = filtered.filter(t => t.completed);
  const overdue = pending.filter(t => t.due_date && new Date(t.due_date) < new Date());

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <ListTodo className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Tasks</h1>
              <p className="text-sm text-slate-400">{pending.length} pending · {overdue.length > 0 ? <span className="text-rose-500">{overdue.length} overdue</span> : "all on track"}</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            {(["pending", "all", "done"] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${filterStatus === s ? "bg-white shadow text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}>
                {s}
              </button>
            ))}
          </div>
          <select value={filterVertical} onChange={e => setFilterVertical(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">All Verticals</option>
            {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
          </select>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none text-slate-600">
            <option value="">All Members</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No tasks {filterStatus !== "all" ? `(${filterStatus})` : ""}</p>
          </div>
        ) : (
          <>
            {pending.map(t => <TaskRow key={t.id} task={t} userId={userId} members={members} onToggle={toggleTask} onDelete={deleteTask} />)}
            {done.length > 0 && (
              <>
                <div className="pt-2 pb-1"><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Completed ({done.length})</p></div>
                {done.map(t => <TaskRow key={t.id} task={t} userId={userId} members={members} onToggle={toggleTask} onDelete={deleteTask} />)}
              </>
            )}
          </>
        )}
      </div>

      {/* Add Task Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">New Task</h3>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Task title *"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Details / description (optional)"
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as typeof form.priority }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Deadline</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Vertical</label>
                <select value={form.vertical_id} onChange={e => setForm(f => ({ ...f, vertical_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
                </select>
              </div>
              {/* Assignees */}
              <div className="relative">
                <button onClick={() => { setShowAssignPicker(v => !v); setMemberSearch(""); }}
                  className="w-full flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:border-indigo-300 focus:outline-none">
                  <Users className="w-4 h-4 text-slate-400" />
                  {form.assigned_to.length === 0
                    ? "Assign to members…"
                    : `${form.assigned_to.length} member${form.assigned_to.length > 1 ? "s" : ""} assigned`}
                  <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-400" />
                </button>
                {showAssignPicker && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg">
                    <div className="p-2 border-b border-slate-100">
                      <input
                        autoFocus
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search members…"
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {members.filter(m => !memberSearch || m.full_name?.toLowerCase().includes(memberSearch.toLowerCase())).map(m => (
                        <label key={m.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                          <input type="checkbox" checked={form.assigned_to.includes(m.id)} onChange={() => toggleAssignee(m.id)} className="accent-indigo-600 w-3.5 h-3.5" />
                          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold shrink-0">
                            {m.full_name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{m.full_name}</p>
                            {m.designation && <p className="text-xs text-slate-400">{m.designation}</p>}
                          </div>
                        </label>
                      ))}
                      {members.filter(m => !memberSearch || m.full_name?.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4">No members found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={addTask} disabled={saving || !form.title.trim()}
                className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                {saving ? "Creating…" : "Create & Notify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, userId, members, onToggle, onDelete }: {
  task: ExtTodo; userId: string; members: Profile[];
  onToggle: (t: ExtTodo) => void; onDelete: (id: string) => void;
}) {
  const assignedMembers = members.filter(m => (task.assigned_to || []).includes(m.id));
  const isOverdue = !task.completed && task.due_date && new Date(task.due_date) < new Date();
  const isAssignedToMe = (task.assigned_to || []).includes(userId);
  const canChange = task.user_id === userId || isAssignedToMe;

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 flex items-start gap-3 group transition-all ${isOverdue ? "border-rose-200 bg-rose-50/30" : "border-slate-200"}`}>
      <button
        onClick={() => canChange && onToggle(task)}
        title={canChange ? (task.completed ? "Mark pending" : "Mark complete") : "Only the creator or assignee can change status"}
        className={`mt-0.5 shrink-0 ${canChange ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}>
        {task.completed
          ? <Check className="w-5 h-5 text-emerald-500" />
          : <Circle className={`w-5 h-5 ${isOverdue ? "text-rose-400" : "text-slate-300 group-hover:text-indigo-400"} transition-colors`} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${task.completed ? "line-through text-slate-400" : "text-slate-800"}`}>{task.title}</p>
        {task.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{task.description}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[task.priority]}`}>
            <Flag className="w-2.5 h-2.5 inline mr-0.5" />{task.priority}
          </span>
          {task.due_date && (
            <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
              <Calendar className="w-3 h-3" />{formatDate(task.due_date)}{isOverdue && " · Overdue"}
            </span>
          )}
          {task.vertical && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${task.vertical.color}20`, color: task.vertical.color }}>
              {task.vertical.icon} {task.vertical.name}
            </span>
          )}
          {isAssignedToMe && task.user_id !== userId && (
            <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">Assigned to you</span>
          )}
          {assignedMembers.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Users className="w-3 h-3" />
              {assignedMembers.map(m => m.full_name?.split(" ")[0]).join(", ")}
            </span>
          )}
          {(task.creator as Profile)?.full_name && task.user_id !== userId && (
            <span className="text-xs text-slate-300">by {(task.creator as Profile).full_name?.split(" ")[0]}</span>
          )}
        </div>
      </div>
      {task.user_id === userId && (
        <button onClick={() => onDelete(task.id)} className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-all text-slate-300" title="Delete task">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
