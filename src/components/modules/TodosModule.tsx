"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { CheckSquare, Plus, X, Check, Circle, AlertCircle, Flag } from "lucide-react";
import type { Todo, Profile } from "@/lib/types";
import { formatDate, PRIORITY_COLORS } from "@/lib/utils";

interface Props { verticalId: string; userId: string; members: Profile[]; }

export default function TodosModule({ verticalId, userId, members }: Props) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low"|"medium"|"high">("medium");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchTodos();
  }, [verticalId]);

  async function fetchTodos() {
    const { data } = await supabase
      .from("todos")
      .select("*, profiles(full_name, email)")
      .eq("vertical_id", verticalId)
      .order("created_at", { ascending: false });
    setTodos((data || []) as Todo[]);
  }

  async function addTodo() {
    if (!title.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from("todos")
      .insert({ vertical_id: verticalId, user_id: userId, title: title.trim(), priority, due_date: dueDate || null, description: description || null, completed: false })
      .select("*, profiles(full_name, email)")
      .single();
    if (data) setTodos([data as Todo, ...todos]);
    setSaving(false);
    setShowForm(false);
    setTitle(""); setDueDate(""); setDescription(""); setPriority("medium");
  }

  async function toggleTodo(todo: Todo) {
    const { data } = await supabase
      .from("todos")
      .update({ completed: !todo.completed })
      .eq("id", todo.id)
      .select("*, profiles(full_name, email)")
      .single();
    if (data) setTodos(todos.map((t) => (t.id === data.id ? data as Todo : t)));
  }

  async function deleteTodo(id: string) {
    await supabase.from("todos").delete().eq("id", id);
    setTodos(todos.filter((t) => t.id !== id));
  }

  const pending = todos.filter((t) => !t.completed);
  const done = todos.filter((t) => t.completed);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-indigo-500" />
          <h3 className="font-semibold text-slate-900 text-sm">To-Dos</h3>
          {pending.length > 0 && (
            <span className="bg-indigo-100 text-indigo-700 text-xs font-medium px-1.5 py-0.5 rounded-full">{pending.length}</span>
          )}
        </div>
        <button onClick={() => setShowForm(true)} className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors text-indigo-600">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showForm && (
        <div className="p-3 border-b border-slate-100 bg-slate-50 animate-fade-in">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title…"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white mb-2"
            onKeyDown={(e) => e.key === "Enter" && addTodo()}
          />
          <div className="flex gap-2 mb-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low"|"medium"|"high")}
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={addTodo} disabled={saving || !title.trim()} className="flex-1 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? "Adding…" : "Add Task"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto max-h-72 divide-y divide-slate-50">
        {pending.length === 0 && done.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No tasks yet
          </div>
        )}
        {pending.map((todo) => <TodoItem key={todo.id} todo={todo} onToggle={toggleTodo} onDelete={deleteTodo} />)}
        {done.length > 0 && (
          <>
            <div className="px-4 py-1.5 bg-slate-50">
              <p className="text-xs text-slate-400 font-medium">Completed ({done.length})</p>
            </div>
            {done.slice(0, 3).map((todo) => <TodoItem key={todo.id} todo={todo} onToggle={toggleTodo} onDelete={deleteTodo} />)}
          </>
        )}
      </div>
    </div>
  );
}

function TodoItem({ todo, onToggle, onDelete }: { todo: Todo; onToggle: (t: Todo) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 group transition-colors">
      <button onClick={() => onToggle(todo)} className="mt-0.5 shrink-0">
        {todo.completed
          ? <Check className="w-4 h-4 text-emerald-500" />
          : <Circle className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${todo.completed ? "line-through text-slate-400" : "text-slate-800"}`}>
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[todo.priority]}`}>
            {todo.priority}
          </span>
          {todo.due_date && (
            <span className="text-xs text-slate-400">{formatDate(todo.due_date)}</span>
          )}
        </div>
      </div>
      <button onClick={() => onDelete(todo.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-50 hover:text-rose-500 rounded transition-all">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
