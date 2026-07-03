"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bell, Calendar, PhoneCall, TrendingUp, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase";

interface Notif {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  created_at: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  meeting: <Calendar className="w-4 h-4 text-blue-500" />,
  followup: <PhoneCall className="w-4 h-4 text-amber-500" />,
  crm: <TrendingUp className="w-4 h-4 text-emerald-500" />,
  mention: <span className="text-sm font-bold text-indigo-500">@</span>,
  info: <Bell className="w-4 h-4 text-slate-400" />,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const READ_KEY = "bcc_notif_read";
function getReadIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); } catch { return new Set(); }
}
function persistReadIds(ids: Set<string>) {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...ids].slice(-200))); } catch {}
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const btnRef = useRef<HTMLButtonElement>(null);
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
    setReadIds(getReadIds());
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const panel = document.getElementById("notif-panel");
      if (panel && !panel.contains(target) && btnRef.current && !btnRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function openPanel() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // Position panel below and to the right of the button, accounting for right edge
      const panelWidth = 320;
      let left = rect.right - panelWidth;
      if (left < 8) left = 8;
      setDropdownPos({ top: rect.bottom + 8, left });
    }
    setOpen(v => !v);
  }

  const fetchNotifs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Generate due follow-up reminders before reading (deduped server-side)
    await fetch("/api/followups/check", { method: "POST" }).catch(() => {});

    const { data: dbNotifs } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    const liveNotifs: Notif[] = [];

    // Upcoming meetings (next 24h)
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const { data: upcomingMeetings } = await supabase
      .from("calendar_events")
      .select("id, summary, start_time")
      .eq("user_id", user.id)
      .gte("start_time", now)
      .lte("start_time", tomorrow)
      .order("start_time")
      .limit(5);

    (upcomingMeetings || []).forEach(m => {
      const hoursUntil = Math.round((new Date(m.start_time).getTime() - Date.now()) / 3600000);
      liveNotifs.push({
        id: `meet_${m.id}`,
        type: "meeting",
        title: m.summary,
        body: hoursUntil <= 1 ? "Starting soon" : `In ${hoursUntil}h`,
        read: false,
        created_at: new Date().toISOString(),
      });
    });

    // Overdue follow-ups (3+ days old, still open)
    const { data: overdueFollowups } = await supabase
      .from("discussions")
      .select("id, title")
      .eq("status", "open")
      .lt("created_at", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
      .limit(5);

    (overdueFollowups || []).forEach(d => {
      liveNotifs.push({
        id: `followup_${d.id}`,
        type: "followup",
        title: d.title || "Pending Follow-up",
        body: "3+ days old, still open",
        read: false,
        created_at: new Date().toISOString(),
      });
    });

    // Recent CRM updates (last 24h)
    const { data: recentCRM } = await supabase
      .from("client_briefs")
      .select("id, brand_name, status, updated_at")
      .gte("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("updated_at", { ascending: false })
      .limit(3);

    (recentCRM || []).forEach(c => {
      liveNotifs.push({
        id: `crm_${c.id}`,
        type: "crm",
        title: `${c.brand_name} — ${c.status}`,
        body: "CRM updated",
        link: "/dashboard/distro",
        read: false,
        created_at: c.updated_at,
      });
    });

    const dismissed = getReadIds();
    const all = [...liveNotifs].map(n => ({ ...n, read: dismissed.has(n.id) }));
    const liveIds = new Set(all.map(n => n.id));
    (dbNotifs || []).forEach(n => {
      if (!liveIds.has(n.id)) all.push({ ...n as Notif, read: n.read || dismissed.has(n.id) });
    });

    setNotifs(all);
    setLoading(false);
  }, [supabase]);

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    const newIds = new Set([...readIds, ...notifs.map(n => n.id)]);
    setReadIds(newIds);
    persistReadIds(newIds);
    setNotifs(n => n.map(x => ({ ...x, read: true })));
  }

  function markRead(id: string) {
    const newIds = new Set([...readIds, id]);
    setReadIds(newIds);
    persistReadIds(newIds);
    setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x));
  }

  function dismiss(id: string) {
    const newIds = new Set([...readIds, id]);
    setReadIds(newIds);
    persistReadIds(newIds);
    setNotifs(n => n.filter(x => x.id !== id));
  }

  const unread = notifs.filter(n => !n.read).length;

  const panel = open && mounted ? createPortal(
    <div
      id="notif-panel"
      className="fixed z-[9999] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
      style={{ top: dropdownPos.top, left: dropdownPos.left, width: 320 }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="font-semibold text-sm text-slate-900">Notifications</span>
        {unread > 0 && (
          <button onClick={markAllRead} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
        {loading && <div className="py-8 text-center text-sm text-slate-400">Loading…</div>}
        {!loading && notifs.length === 0 && (
          <div className="py-10 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
            <Bell className="w-8 h-8 text-slate-200" />
            You&apos;re all caught up
          </div>
        )}
        {notifs.map(n => (
          <div key={n.id} className={`flex gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${n.read ? "opacity-50" : ""}`}>
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
              {TYPE_ICON[n.type] || TYPE_ICON.info}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${n.read ? "text-slate-500" : "text-slate-800 font-medium"} truncate`}>{n.title}</p>
              {n.body && <p className="text-xs text-slate-400 truncate">{n.body}</p>}
              <p className="text-xs text-slate-300 mt-0.5">{timeAgo(n.created_at)}</p>
            </div>
            <div className="shrink-0 flex flex-col gap-0.5 mt-0.5">
              {!n.read && (
                <button onClick={() => markRead(n.id)} title="Mark as read" className="p-1 hover:bg-indigo-100 rounded-lg transition-colors">
                  <Check className="w-3 h-3 text-indigo-500" />
                </button>
              )}
              <button onClick={() => dismiss(n.id)} title="Dismiss" className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
                <X className="w-3 h-3 text-slate-400" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {notifs.length > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
          <button onClick={() => { markAllRead(); setOpen(false); }}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
            <Check className="w-3.5 h-3.5" /> Clear all
          </button>
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={openPanel}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
      >
        <Bell style={{ width: 18, height: 18 }} className="text-slate-600" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {panel}
    </>
  );
}
