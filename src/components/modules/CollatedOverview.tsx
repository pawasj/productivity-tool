"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  Briefcase, CheckSquare, ListTodo, Lightbulb, Loader2, ArrowRight, PhoneCall,
  CalendarClock, ClipboardCheck, ExternalLink,
} from "lucide-react";
import type { Vertical, Todo, Idea, Profile } from "@/lib/types";
import { canAccess } from "@/lib/access-client";

const supabase = createClient();

interface Props {
  verticals: Vertical[];
  userId: string;
  profile: Profile | null;
  focusVerticalId?: string;   // when set, show only this vertical (expanded)
}

interface LeadLite { id: string; company_name: string; status: string; deal_value?: number; monthly_value?: number; engagement_type?: string; vertical_id?: string; created_by?: string; our_poc_id?: string; }
interface BriefLite { id: string; brand_name: string; status?: string; total_budget?: number; budget?: number; vertical_id?: string; created_by?: string; }
type TodoLite = Todo & { kind?: string; assigned_to?: string[] | null };

function fmtL(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

// Pipeline value = deals still in play (approved/live are revenue, not pipeline)
const ACTIVE_STATUSES = ["draft", "pitched", "planning", "negotiation"];

export default function CollatedOverview({ verticals, userId, profile, focusVerticalId }: Props) {
  const showPipeline = canAccess(profile, "sales_pipeline");
  const showTasks = canAccess(profile, "tasks");
  const showIdeas = canAccess(profile, "idea_dump");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [briefs, setBriefs] = useState<BriefLite[]>([]);
  const [todos, setTodos] = useState<TodoLite[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<Array<{ id: string; leave_type: string; from_date: string; to_date: string; days: number; profiles?: { full_name?: string } }>>([]);
  const [meetings, setMeetings] = useState<Array<{ id: string; summary?: string; start_time: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [l, b, t, i] = await Promise.all([
      supabase.from("leads").select("id, company_name, status, deal_value, monthly_value, engagement_type, vertical_id, created_by, our_poc_id"),
      supabase.from("client_briefs").select("id, brand_name, status, total_budget, budget, vertical_id, created_by"),
      supabase.from("todos").select("*").eq("completed", false).order("created_at", { ascending: false }),
      supabase.from("ideas").select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(200),
    ]);
    // Members see only their own leads/briefs on the dashboard; admins see all
    const admin = profile?.role === "admin";
    const allLeads = (l.data || []) as LeadLite[];
    const allBriefs = (b.data || []) as BriefLite[];
    setLeads(admin ? allLeads : allLeads.filter(x => x.created_by === userId || x.our_poc_id === userId));
    setBriefs(admin ? allBriefs : allBriefs.filter(x => x.created_by === userId));
    setTodos((t.data || []) as TodoLite[]);
    setIdeas((i.data || []) as Idea[]);
    setLoading(false);

    // Secondary widgets — leave approvals (managers/admins) + upcoming meetings
    fetch("/api/dashboard/pending-leaves").then(r => r.json())
      .then(j => setPendingLeaves(j.data || [])).catch(() => {});
    // /api/calendar/events syncs from Google (with token refresh) and returns events
    fetch("/api/calendar/events").then(r => r.json()).then(j => {
      const weekAhead = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const evts = ((j.events || []) as Array<{ id: string; summary?: string; start_time: string }>)
        .filter(e => e.start_time && new Date(e.start_time).getTime() <= weekAhead)
        .slice(0, 5);
      setMeetings(evts);
    }).catch(() => {});
  }, [userId, profile]);

  useEffect(() => { load(); }, [load]);

  // Refresh when returning to the tab
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>;

  const shown = focusVerticalId ? verticals.filter(v => v.id === focusVerticalId) : verticals;

  // Global KPIs
  const activeLeads = leads.filter(l => ACTIVE_STATUSES.includes(l.status));
  const activeBriefs = briefs.filter(b => ACTIVE_STATUSES.includes(String(b.status || "draft")));
  const pipelineValue = activeLeads.reduce((s, l) => s + (l.engagement_type === "retainer" ? (l.monthly_value || 0) : (l.deal_value || 0)), 0)
    + activeBriefs.reduce((s, b) => s + (Number(b.total_budget ?? b.budget) || 0), 0);
  const myTodos = todos.filter(t => t.user_id === userId && !t.assigned_to);
  const teamTasks = todos.filter(t => (t.assigned_to || []).length > 0);

  return (
    <div className="space-y-5">
      {/* Global KPI strip — only on the all-verticals view */}
      {!focusVerticalId && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {showPipeline && <Kpi label="Active Pipeline" value={fmtL(pipelineValue)} sub={`${activeLeads.length + activeBriefs.length} deals in play`} color="bg-indigo-600" onClick={() => router.push("/dashboard/pipeline")} />}
          {showTasks && <Kpi label="Open Team Tasks" value={String(teamTasks.length)} sub="across all members" color="bg-blue-600" onClick={() => router.push("/dashboard/tasks")} />}
          <Kpi label="My To-Dos" value={String(myTodos.length)} sub="pending personal items" color="bg-teal-600" onClick={() => router.push("/dashboard/todos")} />
          {showIdeas && <Kpi label="Ideas Captured" value={String(ideas.length)} sub="team idea dump" color="bg-amber-500" onClick={() => router.push("/dashboard/ideas")} />}
        </div>
      )}

      {/* Leave approvals + upcoming meetings */}
      {!focusVerticalId && (pendingLeaves.length > 0 || meetings.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pendingLeaves.length > 0 && (
            <button onClick={() => router.push("/dashboard/profile")}
              className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardCheck className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-bold text-amber-800">Leave Approvals Pending</p>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white bg-amber-500">{pendingLeaves.length}</span>
                <ArrowRight className="w-3.5 h-3.5 text-amber-400 ml-auto" />
              </div>
              <div className="space-y-1">
                {pendingLeaves.slice(0, 3).map(l => (
                  <p key={l.id} className="text-xs text-amber-800">
                    <span className="font-semibold">{l.profiles?.full_name || "Member"}</span>
                    {" — "}{l.leave_type} · {l.days} day{l.days !== 1 ? "s" : ""} from {new Date(l.from_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                ))}
                {pendingLeaves.length > 3 && <p className="text-[11px] text-amber-500">+{pendingLeaves.length - 3} more…</p>}
              </div>
            </button>
          )}
          {meetings.length > 0 && (
            <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer"
              className="bg-sky-50 border border-sky-200 rounded-2xl p-4 hover:shadow-md transition-shadow block">
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="w-4 h-4 text-sky-600" />
                <p className="text-sm font-bold text-sky-800">Upcoming Meetings</p>
                <ExternalLink className="w-3 h-3 text-sky-400 ml-auto" />
              </div>
              <div className="space-y-1">
                {meetings.slice(0, 3).map(m => (
                  <p key={m.id} className="text-xs text-sky-800">
                    <span className="font-semibold">
                      {new Date(m.start_time).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })}
                    </span>
                    {" — "}{m.summary || "Untitled meeting"}
                  </p>
                ))}
              </div>
            </a>
          )}
        </div>
      )}

      {/* Per-vertical sections */}
      {shown.map(v => {
        const vLeads = leads.filter(l => l.vertical_id === v.id && ACTIVE_STATUSES.includes(l.status));
        const vBriefs = briefs.filter(b => b.vertical_id === v.id && ACTIVE_STATUSES.includes(String(b.status || "draft")));
        const vValue = vLeads.reduce((s, l) => s + (l.engagement_type === "retainer" ? (l.monthly_value || 0) : (l.deal_value || 0)), 0)
          + vBriefs.reduce((s, b) => s + (Number(b.total_budget ?? b.budget) || 0), 0);
        const vTasks = todos.filter(t => t.vertical_id === v.id && (t.assigned_to || []).length > 0);
        const vMyTodos = todos.filter(t => t.vertical_id === v.id && t.user_id === userId && !t.assigned_to);
        const vIdeas = ideas.filter(i => i.vertical_id === v.id);
        const isEmpty = (showPipeline ? vLeads.length + vBriefs.length : 0) + (showTasks ? vTasks.length : 0) + vMyTodos.length + (showIdeas ? vIdeas.length : 0) === 0;
        if (isEmpty && !focusVerticalId) return null;

        return (
          <div key={v.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100" style={{ background: `${v.color}08` }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{v.icon}</span>
                <h3 className="font-bold text-slate-900">{v.name}</h3>
              </div>
              {showPipeline && vValue > 0 && <span className="text-sm font-bold" style={{ color: v.color }}>{fmtL(vValue)} in pipeline</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* Pipeline */}
              {showPipeline && <Section title="Sales Pipeline" icon={Briefcase} color="#6366f1" count={vLeads.length + vBriefs.length}
                onOpen={() => router.push("/dashboard/pipeline")}>
                {[...vLeads.map(l => ({ id: l.id, name: l.company_name, meta: l.status, value: l.engagement_type === "retainer" ? l.monthly_value : l.deal_value })),
                  ...vBriefs.map(b => ({ id: b.id, name: b.brand_name, meta: String(b.status || "draft"), value: Number(b.total_budget ?? b.budget) || 0 }))]
                  .slice(0, 4).map(item => (
                    <div key={item.id} className="flex items-center justify-between py-1">
                      <span className="text-xs text-slate-700 truncate flex-1">{item.name}</span>
                      <span className="text-[10px] text-slate-400 capitalize px-1.5">{item.meta}</span>
                      {item.value ? <span className="text-xs font-semibold text-slate-600">{fmtL(item.value)}</span> : null}
                    </div>
                  ))}
              </Section>}

              {/* Team tasks */}
              {showTasks && <Section title="Team Tasks" icon={CheckSquare} color="#3b82f6" count={vTasks.length}
                onOpen={() => router.push("/dashboard/tasks")}>
                {vTasks.slice(0, 4).map(t => (
                  <div key={t.id} className="flex items-center gap-1.5 py-1">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.priority === "high" ? "bg-rose-400" : t.priority === "medium" ? "bg-amber-400" : "bg-slate-300"}`} />
                    <span className="text-xs text-slate-700 truncate">{t.title}</span>
                  </div>
                ))}
              </Section>}

              {/* My to-dos */}
              <Section title="My To-Dos" icon={ListTodo} color="#0d9488" count={vMyTodos.length}
                onOpen={() => router.push("/dashboard/todos")}>
                {vMyTodos.slice(0, 4).map(t => (
                  <div key={t.id} className="flex items-center gap-1.5 py-1">
                    {(t.kind || "todo") === "follow_up"
                      ? <PhoneCall className="w-3 h-3 text-sky-400 shrink-0" />
                      : <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.priority === "high" ? "bg-rose-400" : t.priority === "medium" ? "bg-amber-400" : "bg-slate-300"}`} />}
                    <span className="text-xs text-slate-700 truncate">{t.title}</span>
                    {t.due_date && new Date(t.due_date) < new Date() && <span className="text-[10px] text-rose-500 font-semibold shrink-0">overdue</span>}
                  </div>
                ))}
              </Section>

              {/* Ideas */}
              {showIdeas && <Section title="Ideas" icon={Lightbulb} color="#f59e0b" count={vIdeas.length}
                onOpen={() => router.push("/dashboard/ideas")}>
                {vIdeas.slice(0, 3).map(i => (
                  <p key={i.id} className="text-xs text-slate-600 py-1 line-clamp-2 leading-snug">
                    💡 {i.content}
                  </p>
                ))}
              </Section>}
            </div>
          </div>
        );
      })}

      {/* Items with no vertical */}
      {!focusVerticalId && (() => {
        const noVertTodos = todos.filter(t => !t.vertical_id && t.user_id === userId && !t.assigned_to);
        if (noVertTodos.length === 0) return null;
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">General (no vertical) — my to-dos</p>
            <div className="flex flex-wrap gap-2">
              {noVertTodos.slice(0, 8).map(t => (
                <span key={t.id} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{t.title}</span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Kpi({ label, value, sub, color, onClick }: { label: string; value: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-white rounded-2xl border border-slate-200 p-4 text-left hover:shadow-md transition-shadow">
      <div className={`w-7 h-7 ${color} rounded-lg mb-2`} />
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </button>
  );
}

function Section({ title, icon: Icon, color, count, onOpen, children }: {
  title: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string; count: number; onOpen: () => void; children: React.ReactNode;
}) {
  return (
    <div className="p-4">
      <button onClick={onOpen} className="w-full flex items-center justify-between mb-2 group">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <Icon className="w-3.5 h-3.5" style={{ color }} />
          {title}
          {count > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: color }}>{count}</span>}
        </span>
        <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
      </button>
      {count === 0 ? <p className="text-xs text-slate-300 italic">Nothing yet</p> : children}
    </div>
  );
}
