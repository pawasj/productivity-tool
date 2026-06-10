"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Calendar, Plus, X, Video, ExternalLink, Clock } from "lucide-react";
import type { Meeting, Profile } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface Props { verticalId: string; userId: string; members: Profile[]; }

export default function MeetingsModule({ verticalId, userId, members }: Props) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [meetLink, setMeetLink] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => { fetchMeetings(); }, [verticalId]);

  async function fetchMeetings() {
    const { data } = await supabase
      .from("meetings")
      .select("*")
      .eq("vertical_id", verticalId)
      .gte("start_time", new Date(Date.now() - 86400000).toISOString())
      .order("start_time");
    setMeetings((data || []) as Meeting[]);
  }

  async function addMeeting() {
    if (!title.trim() || !startTime) return;
    setSaving(true);
    const { data } = await supabase
      .from("meetings")
      .insert({
        vertical_id: verticalId,
        title: title.trim(),
        start_time: startTime,
        end_time: endTime || null,
        meet_link: meetLink || null,
        assigned_to: assignedTo || null,
        attendees: [],
      })
      .select()
      .single();
    if (data) setMeetings([...meetings, data as Meeting].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()));
    setSaving(false);
    setShowForm(false);
    setTitle(""); setStartTime(""); setEndTime(""); setMeetLink(""); setAssignedTo("");
  }

  async function deleteMeeting(id: string) {
    await supabase.from("meetings").delete().eq("id", id);
    setMeetings(meetings.filter((m) => m.id !== id));
  }

  const upcoming = meetings.filter((m) => new Date(m.start_time) > new Date());
  const past = meetings.filter((m) => new Date(m.start_time) <= new Date());

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Meetings</h3>
          {upcoming.length > 0 && (
            <span className="bg-emerald-100 text-emerald-700 text-xs font-medium px-1.5 py-0.5 rounded-full">{upcoming.length} upcoming</span>
          )}
        </div>
        <button onClick={() => setShowForm(true)} className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors text-emerald-600">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showForm && (
        <div className="p-3 border-b border-slate-100 bg-slate-50 animate-fade-in space-y-2">
          <input
            autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Meeting title…"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 mb-0.5 block">Start</label>
              <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-0.5 block">End</label>
              <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
          <input value={meetLink} onChange={(e) => setMeetLink(e.target.value)}
            placeholder="Google Meet / Zoom link (optional)"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
            <option value="">Assign to team member (optional)</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={addMeeting} disabled={saving || !title.trim() || !startTime} className="flex-1 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {saving ? "Adding…" : "Add Meeting"}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
        {meetings.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No meetings scheduled
          </div>
        )}
        {upcoming.map((m) => <MeetingItem key={m.id} meeting={m} onDelete={deleteMeeting} members={members} upcoming />)}
        {past.length > 0 && (
          <div className="px-4 py-1.5 bg-slate-50">
            <p className="text-xs text-slate-400 font-medium">Past</p>
          </div>
        )}
        {past.slice(0, 2).map((m) => <MeetingItem key={m.id} meeting={m} onDelete={deleteMeeting} members={members} upcoming={false} />)}
      </div>
    </div>
  );
}

function MeetingItem({ meeting: m, onDelete, members, upcoming }: {
  meeting: Meeting; onDelete: (id: string) => void; members: Profile[]; upcoming: boolean;
}) {
  const assignedMember = members.find((mb) => mb.id === m.assigned_to);
  return (
    <div className={`flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 group transition-colors ${!upcoming ? "opacity-60" : ""}`}>
      <div className="shrink-0 mt-0.5">
        <div className={`w-2 h-2 rounded-full mt-1.5 ${upcoming ? "bg-emerald-400" : "bg-slate-300"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{m.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="text-xs text-slate-400">{formatDateTime(m.start_time)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {assignedMember && <span className="text-xs text-slate-400">→ {assignedMember.full_name}</span>}
          {m.meet_link && (
            <a href={m.meet_link} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-700">
              <Video className="w-3 h-3" /> Join
            </a>
          )}
        </div>
      </div>
      <button onClick={() => onDelete(m.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-50 hover:text-rose-500 rounded transition-all shrink-0">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
