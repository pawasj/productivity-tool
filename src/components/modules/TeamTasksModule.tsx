"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { ListTodo, Plus, X, Check, Circle, Users, ChevronDown } from "lucide-react";
import type { Todo, Profile } from "@/lib/types";
import { formatDate, PRIORITY_COLORS } from "@/lib/utils";

interface Props { verticalId: string; userId: string; members: Profile[]; }

export default function TeamTasksModule({ verticalId, userId, members }: Props) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchTodos();

    // Realtime: re-fetch when any todo in this vertical changes so assigned members see it instantly
    const channel = supabase
      .channel(`team-tasks:${verticalId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "todos",
        filter: `vertical_id=eq.${verticalId}`,
      }, () => { fetchTodos(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [verticalId]);

  async function fetchTodos() {
    // Fetch all todos in this vertical — RLS policy handles visibility
    // (includes tasks created by user AND tasks assigned to user)
    const { data } = await supabase
      .from("todos")
      .select("*, profiles(full_name, email)")
      .eq("vertical_id", verticalId)
      .order("created_at", { ascending: false });
    const seen = new Set<string>();
    const deduped = (data || []).filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
    setTodos(deduped as Todo[]);
  }

  async function addTodo() {
    if (!title.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from("todos")
      .insert({
        vertical_id: verticalId,
        user_id: userId,
        title: title.trim(),
        priority,
        due_date: dueDate || null,
        description: description || null,
        completed: false,
        assigned_to: assignedTo.length > 0 ? assignedTo : null,
      })
      .select("*, profiles(full_name, email)")
      .single();
    if (data) setTodos([data as Todo, ...todos]);
    setSaving(false);
    setShowForm(false);
    setTitle(""); setDueDate(""); setDescription(""); setPriority("medium"); setAssignedTo([]);
  }

  async function toggleTodo(todo: Todo) {
    const { data } = await supabase.from("todos").update({ completed: !todo.completed }).eq("id", todo.id).select("*, profiles(full_name, email)").single();
    if (data) setTodos(todos.map(t => t.id === data.id ? data as Todo : t));
  }

  async function deleteTodo(id: string) {
    await supabase.from("todos").delete().eq("id", id);
    setTodos(todos.filter(t => t.id !== id));
  }

  function toggleMember(id: string) {
    setAssignedTo(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const pending = todos.filter(t => !t.completed);
  const done = todos.filter(t => t.completed);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-indigo-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Team Tasks</h3>
          {pending.length > 0 && (
            <span className="bg-indigo-100 text-indigo-700 text-xs font-medium px-1.5 py-0.5 rounded-full">{pending.length}</span>
          )}
        </div>
        <button onClick={() => setShowForm(true)} className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors text-indigo-600">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showForm && (
        <div className="p-3 border-b border-slate-100 bg-slate-50">
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title…"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white mb-2"
            onKeyDown={e => e.key === "Enter" && addTodo()} />
          <div className="flex gap-2 mb-2">
            <select value={priority} onChange={e => setPriority(e.target.value as "low" | "medium" | "high")}
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Assign to team members */}
          {members.length > 0 && (
            <div className="mb-2 relative">
              <button onClick={() => setShowAssignPicker(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-600 hover:border-indigo-300">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                {assignedTo.length === 0 ? "Assign to team members (optional)" : `Assigned to ${assignedTo.length} member(s)`}
                <ChevronDown className="w-3 h-3 ml-auto text-slate-400" />
              </button>
              {showAssignPicker && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg max-h-40 overflow-y-auto">
                  {members.filter(m => m.id !== userId).map(m => (
                    <label key={m.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={assignedTo.includes(m.id)} onChange={() => toggleMember(m.id)} className="accent-indigo-600 w-3.5 h-3.5" />
                      <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold shrink-0">
                        {m.full_name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{m.full_name}</p>
                        {m.designation && <p className="text-[10px] text-slate-400 truncate">{m.designation}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setShowAssignPicker(false); }} className="flex-1 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={addTodo} disabled={saving || !title.trim()} className="flex-1 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? "Adding…" : "Add Task"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto max-h-72 divide-y divide-slate-50">
        {pending.length === 0 && done.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-30" />No tasks yet
          </div>
        )}
        {pending.map(todo => <TaskItem key={todo.id} todo={todo} currentUserId={userId} members={members} onToggle={toggleTodo} onDelete={deleteTodo} />)}
        {done.length > 0 && (
          <>
            <div className="px-4 py-1.5 bg-slate-50">
              <p className="text-xs text-slate-400 font-medium">Completed ({done.length})</p>
            </div>
            {done.slice(0, 3).map(todo => <TaskItem key={todo.id} todo={todo} currentUserId={userId} members={members} onToggle={toggleTodo} onDelete={deleteTodo} />)}
          </>
        )}
      </div>
    </div>
  );
}

function TaskItem({ todo, currentUserId, members, onToggle, onDelete }: {
  todo: Todo & { assigned_to?: string[] };
  currentUserId: string;
  members: Profile[];
  onToggle: (t: Todo) => void;
  onDelete: (id: string) => void;
}) {
  const assignedMembers = members.filter(m => (todo.assigned_to || []).includes(m.id));
  const isAssigned = (todo.assigned_to || []).includes(currentUserId);

  return (
    <div className={`flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 group transition-colors ${isAssigned && todo.user_id !== currentUserId ? "bg-indigo-50/30" : ""}`}>
      <button onClick={() => onToggle(todo)} className="mt-0.5 shrink-0">
        {todo.completed ? <Check className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${todo.completed ? "line-through text-slate-400" : "text-slate-800"}`}>{todo.title}</p>
        <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[todo.priority]}`}>{todo.priority}</span>
          {todo.due_date && <span className="text-xs text-slate-400">{formatDate(todo.due_date)}</span>}
          {isAssigned && todo.user_id !== currentUserId && (
            <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">assigned to you</span>
          )}
          {assignedMembers.length > 0 && todo.user_id === currentUserId && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Users className="w-3 h-3" />
              {assignedMembers.map(m => m.full_name?.split(" ")[0]).join(", ")}
            </span>
          )}
        </div>
      </div>
      {todo.user_id === currentUserId && (
        <button onClick={() => onDelete(todo.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-50 hover:text-rose-500 rounded transition-all">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
