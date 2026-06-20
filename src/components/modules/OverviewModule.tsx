"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { CheckSquare, PhoneCall, Calendar, Lightbulb, TrendingUp, ArrowRight, Video, MapPin, ChevronDown } from "lucide-react";
import type { Vertical } from "@/lib/types";

interface VerticalStats {
  id: string; name: string; color: string; icon: string;
  todos: number; todosCompleted: number; followups: number;
  meetings: number; notes: number; ideas: number; leads: number;
}

interface CalEvent {
  id: string;
  summary: string;
  start_time: string;
  end_time?: string;
  location?: string;
  meet_link?: string;
  vertical_id?: string;
  verticals?: { id: string; name: string; color: string; icon: string } | null;
}

interface Props {
  verticals: Vertical[];
  onSelectVertical: (id: string) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function OverviewModule({ verticals, onSelectVertical }: Props) {
  const [stats, setStats] = useState<VerticalStats[]>([]);
  const [globalStats, setGlobalStats] = useState({ todos: 0, followups: 0, meetings: 0, ideas: 0, leads: 0 });
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [calConnected, setCalConnected] = useState(false);
  const [calLoading, setCalLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assigningEvent, setAssigningEvent] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => { fetchStats(); fetchCalendar(); }, []);

  const fetchCalendar = useCallback(async () => {
    setCalLoading(true);
    try {
      const res = await fetch("/api/calendar/events");
      const json = await res.json();
      setCalConnected(json.connected || false);
      setCalEvents(json.events || []);
    } catch {
      // Calendar not connected or error — silent
    } finally {
      setCalLoading(false);
    }
  }, []);

  async function assignVertical(eventId: string, verticalId: string | null) {
    await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, verticalId }),
    });
    setCalEvents(evs => evs.map(e => {
      if (e.id !== eventId) return e;
      const vert = verticals.find(v => v.id === verticalId);
      return { ...e, vertical_id: verticalId || undefined, verticals: vert ? { id: vert.id, name: vert.name, color: vert.color, icon: vert.icon } : null };
    }));
    setAssigningEvent(null);
  }

  async function fetchStats() {
    setLoading(true);
    const verticalIds = verticals.map(v => v.id);
    if (!verticalIds.length) { setLoading(false); return; }

    const [todosRes, discussionsRes, meetingsRes, notesRes, ideasRes, leadsRes] = await Promise.all([
      supabase.from("todos").select("vertical_id, completed").in("vertical_id", verticalIds),
      supabase.from("discussions").select("vertical_id, status").in("vertical_id", verticalIds),
      supabase.from("meetings").select("vertical_id, start_time").in("vertical_id", verticalIds).gte("start_time", new Date().toISOString()),
      supabase.from("notes").select("vertical_id").in("vertical_id", verticalIds),
      supabase.from("ideas").select("vertical_id").in("vertical_id", verticalIds),
      supabase.from("leads").select("vertical_id, status").in("vertical_id", verticalIds).not("status", "in", '("won","lost")'),
    ]);

    const todos = todosRes.data || [];
    const discussions = discussionsRes.data || [];
    const meetings = meetingsRes.data || [];
    const notes = notesRes.data || [];
    const ideas = ideasRes.data || [];
    const leads = leadsRes.data || [];

    setStats(verticals.map(v => ({
      id: v.id, name: v.name, color: v.color, icon: v.icon,
      todos: todos.filter(t => t.vertical_id === v.id && !t.completed).length,
      todosCompleted: todos.filter(t => t.vertical_id === v.id && t.completed).length,
      followups: discussions.filter(d => d.vertical_id === v.id && d.status !== "done").length,
      meetings: meetings.filter(m => m.vertical_id === v.id).length,
      notes: notes.filter(n => n.vertical_id === v.id).length,
      ideas: ideas.filter(i => i.vertical_id === v.id).length,
      leads: leads.filter(l => l.vertical_id === v.id).length,
    })));

    setGlobalStats({
      todos: todos.filter(t => !t.completed).length,
      followups: discussions.filter(d => d.status !== "done").length,
      meetings: meetings.length + calEvents.length,
      ideas: ideas.length,
      leads: leads.length,
    });
    setLoading(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Global summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Open Tasks", value: globalStats.todos, icon: CheckSquare, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "Follow-ups", value: globalStats.followups, icon: PhoneCall, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Meetings", value: calEvents.length || globalStats.meetings, icon: Calendar, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Ideas Dumped", value: globalStats.ideas, icon: Lightbulb, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Active Leads", value: globalStats.leads, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-2`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-900">{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Upcoming Meetings from Google Calendar */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Upcoming Meetings
          </h2>
          {!calConnected && (
            <a href="/dashboard/admin" className="text-xs text-indigo-600 hover:underline">
              Connect Google Calendar →
            </a>
          )}
          {calConnected && (
            <button onClick={fetchCalendar} className="text-xs text-slate-400 hover:text-slate-600">
              Refresh
            </button>
          )}
        </div>

        {calLoading && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-400">Syncing calendar…</div>
        )}

        {!calLoading && !calConnected && (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 p-5 text-center">
            <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500 mb-1">No calendar connected</p>
            <p className="text-xs text-slate-400">Go to Admin Panel → connect your Google Calendar to see upcoming meetings here</p>
          </div>
        )}

        {!calLoading && calConnected && calEvents.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-400">
            No meetings in the next 7 days.
          </div>
        )}

        {!calLoading && calEvents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {calEvents.map(evt => (
              <div key={evt.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800 truncate">{evt.summary}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDate(evt.start_time)} · {formatTime(evt.start_time)}
                      {evt.end_time && ` – ${formatTime(evt.end_time)}`}
                    </p>
                  </div>
                  {evt.meet_link && (
                    <a href={evt.meet_link} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors">
                      <Video className="w-3 h-3" /> Join
                    </a>
                  )}
                </div>

                {evt.location && (
                  <p className="text-xs text-slate-400 flex items-center gap-1 mb-2 truncate">
                    <MapPin className="w-3 h-3 shrink-0" /> {evt.location}
                  </p>
                )}

                {/* Vertical assignment */}
                <div className="flex items-center gap-2">
                  {evt.verticals ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${evt.verticals.color}15`, color: evt.verticals.color }}>
                      {evt.verticals.icon} {evt.verticals.name}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">No vertical</span>
                  )}

                  <div className="relative ml-auto">
                    <button
                      onClick={() => setAssigningEvent(assigningEvent === evt.id ? null : evt.id)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-0.5 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      {evt.vertical_id ? "Change" : "Assign"} <ChevronDown className="w-3 h-3" />
                    </button>

                    {assigningEvent === evt.id && (
                      <div className="absolute right-0 bottom-7 bg-white rounded-xl shadow-xl border border-slate-200 z-20 py-1 w-44">
                        <button onClick={() => assignVertical(evt.id, null)}
                          className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:bg-slate-50">
                          None
                        </button>
                        {verticals.map(v => (
                          <button key={v.id} onClick={() => assignVertical(evt.id, v.id)}
                            className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                            <span>{v.icon}</span> {v.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-vertical breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Vertical Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {stats.map(v => {
            const verticalCalEvents = calEvents.filter(e => e.vertical_id === v.id);
            return (
              <div key={v.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => onSelectVertical(v.id)}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ backgroundColor: `${v.color}20` }}>
                      {v.icon}
                    </div>
                    <span className="font-semibold text-slate-800 text-sm">{v.name}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>

                {(v.todos + v.todosCompleted) > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Tasks</span>
                      <span>{v.todosCompleted}/{v.todos + v.todosCompleted} done</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.round((v.todosCompleted / (v.todos + v.todosCompleted)) * 100)}%`, backgroundColor: v.color }} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Follow-ups", value: v.followups, icon: PhoneCall },
                    { label: "Meetings", value: v.meetings + verticalCalEvents.length, icon: Calendar },
                    { label: "Ideas", value: v.ideas, icon: Lightbulb },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="text-center">
                      <div className="text-base font-bold text-slate-800">{value}</div>
                      <div className="text-xs text-slate-400">{label}</div>
                    </div>
                  ))}
                </div>

                {v.leads > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                    <span className="text-xs text-slate-500">{v.leads} active lead{v.leads > 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
