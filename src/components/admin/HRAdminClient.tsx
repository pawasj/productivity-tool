"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import type { Profile, LeaveApplication, CompanyHoliday } from "@/lib/types";
import {
  Users, Calendar, ClipboardList, Save, Plus, Trash2,
  CheckCircle2, XCircle, Loader2, AlertCircle,
} from "lucide-react";

const HR_TABS = [
  { id: "team", label: "Team Management", icon: Users },
  { id: "holidays", label: "Holiday Calendar", icon: Calendar },
  { id: "leaves", label: "All Leave Approvals", icon: ClipboardList },
];

const LEAVE_TYPES: Record<string, string> = {
  casual: "Casual", sick: "Sick", earned: "Earned",
  wfh: "WFH", half_day: "Half Day", optional: "Optional",
};

const LEAVE_COLORS: Record<string, string> = {
  casual: "bg-blue-100 text-blue-700",
  sick: "bg-rose-100 text-rose-700",
  earned: "bg-emerald-100 text-emerald-700",
  wfh: "bg-violet-100 text-violet-700",
  half_day: "bg-amber-100 text-amber-700",
  optional: "bg-slate-100 text-slate-600",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
};

interface Props {
  adminProfile: Profile;
  members: Profile[];
}

export default function HRAdminClient({ adminProfile, members: initMembers }: Props) {
  const supabase = createClient();
  const [hrTab, setHrTab] = useState("team");
  const [members, setMembers] = useState<Profile[]>(initMembers);
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [editingMember, setEditingMember] = useState<Partial<Profile> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [leaveFilter, setLeaveFilter] = useState("pending");
  const [holidayForm, setHolidayForm] = useState({ name: "", date: "", holiday_type: "public", description: "" });
  const [showHolidayForm, setShowHolidayForm] = useState(false);

  useEffect(() => {
    if (hrTab === "leaves") fetchLeaves();
    if (hrTab === "holidays") fetchHolidays();
  }, [hrTab]);

  async function fetchLeaves() {
    const { data } = await supabase.from("leave_applications")
      .select("*, profiles:user_id(full_name, email, designation, reporting_manager_id), approver:approved_by(full_name)")
      .order("created_at", { ascending: false });
    setLeaves((data || []) as LeaveApplication[]);
  }

  async function fetchHolidays() {
    const { data } = await supabase.from("company_holidays").select("*").order("date");
    setHolidays((data || []) as CompanyHoliday[]);
  }

  function flash(type: "success" | "error", text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  }

  // ── Team Management ────────────────────────────────────────────────────────
  async function saveMember() {
    if (!editingMember?.id) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      designation: editingMember.designation,
      department: editingMember.department,
      team: editingMember.team,
      role: editingMember.role,
      reporting_manager_id: editingMember.reporting_manager_id || null,
      employee_id: editingMember.employee_id,
      date_of_joining: editingMember.date_of_joining || null,
      employment_type: editingMember.employment_type,
      phone: editingMember.phone,
    }).eq("id", editingMember.id);
    setSaving(false);
    if (error) { flash("error", error.message); return; }
    setMembers(members.map(m => m.id === editingMember.id ? { ...m, ...editingMember } as Profile : m));
    setEditingMember(null);
    flash("success", "Member updated");
  }

  // ── Leave Approval ─────────────────────────────────────────────────────────
  async function updateLeave(id: string, status: "approved" | "rejected", rejectionReason?: string) {
    await supabase.from("leave_applications").update({
      status, approved_by: adminProfile.id,
      approved_at: new Date().toISOString(),
      rejection_reason: rejectionReason || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    fetchLeaves();
  }

  // ── Holiday Calendar ───────────────────────────────────────────────────────
  async function addHoliday() {
    if (!holidayForm.name || !holidayForm.date) return;
    setSaving(true);
    const { error } = await supabase.from("company_holidays").insert({ ...holidayForm, created_by: adminProfile.id });
    setSaving(false);
    if (error) { flash("error", error.message); return; }
    setHolidayForm({ name: "", date: "", holiday_type: "public", description: "" });
    setShowHolidayForm(false);
    fetchHolidays();
    flash("success", "Holiday added");
  }

  async function deleteHoliday(id: string) {
    if (!confirm("Delete this holiday?")) return;
    await supabase.from("company_holidays").delete().eq("id", id);
    fetchHolidays();
  }

  const filteredLeaves = leaveFilter === "all" ? leaves : leaves.filter(l => l.status === leaveFilter);

  return (
    <div className="space-y-4">
      {/* HR Subtabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {HR_TABS.map(t => (
          <button key={t.id} onClick={() => setHrTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${hrTab === t.id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg w-fit ${msg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* ── TEAM MANAGEMENT ── */}
      {hrTab === "team" && (
        <div className="space-y-4">
          {editingMember ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-5">
                Edit: {editingMember.full_name}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <HRField label="Employee ID">
                  <input value={editingMember.employee_id || ""} onChange={e => setEditingMember({ ...editingMember, employee_id: e.target.value })} placeholder="EMP001" className={inputCls} />
                </HRField>
                <HRField label="Designation">
                  <input value={editingMember.designation || ""} onChange={e => setEditingMember({ ...editingMember, designation: e.target.value })} placeholder="e.g. Senior Executive" className={inputCls} />
                </HRField>
                <HRField label="Department">
                  <input value={editingMember.department || ""} onChange={e => setEditingMember({ ...editingMember, department: e.target.value })} placeholder="e.g. Distribution" className={inputCls} />
                </HRField>
                <HRField label="Team">
                  <input value={editingMember.team || ""} onChange={e => setEditingMember({ ...editingMember, team: e.target.value })} placeholder="e.g. North India" className={inputCls} />
                </HRField>
                <HRField label="Role">
                  <select value={editingMember.role || "member"} onChange={e => setEditingMember({ ...editingMember, role: e.target.value as "admin" | "member" })} className={inputCls}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </HRField>
                <HRField label="Reporting Manager">
                  <select value={editingMember.reporting_manager_id || ""}
                    onChange={e => setEditingMember({ ...editingMember, reporting_manager_id: e.target.value || undefined })}
                    className={inputCls}>
                    <option value="">— None —</option>
                    {members.filter(m => m.id !== editingMember.id).map(m => (
                      <option key={m.id} value={m.id}>{m.full_name} {m.designation ? `(${m.designation})` : ""}</option>
                    ))}
                  </select>
                </HRField>
                <HRField label="Date of Joining">
                  <input type="date" value={editingMember.date_of_joining || ""} onChange={e => setEditingMember({ ...editingMember, date_of_joining: e.target.value })} className={inputCls} />
                </HRField>
                <HRField label="Employment Type">
                  <select value={editingMember.employment_type || "full_time"} onChange={e => setEditingMember({ ...editingMember, employment_type: e.target.value as Profile["employment_type"] })} className={inputCls}>
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Intern</option>
                  </select>
                </HRField>
                <HRField label="Phone">
                  <input value={editingMember.phone || ""} onChange={e => setEditingMember({ ...editingMember, phone: e.target.value })} placeholder="+91 98765 43210" className={inputCls} />
                </HRField>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={saveMember} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-60">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
                <button onClick={() => setEditingMember(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Employee", "Designation / Dept", "Team", "Reporting To", "Role", "Joined", ""].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map(m => {
                    const manager = members.find(p => p.id === m.reporting_manager_id);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs shrink-0">
                              {m.full_name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{m.full_name}</p>
                              <p className="text-xs text-slate-400">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {m.designation || "—"}
                          {m.department && <span className="text-slate-400"> / {m.department}</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{m.team || "—"}</td>
                        <td className="px-4 py-3 text-slate-500">{manager?.full_name || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                            {m.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {m.date_of_joining ? new Date(m.date_of_joining).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setEditingMember({ ...m })}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── HOLIDAY CALENDAR ── */}
      {hrTab === "holidays" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowHolidayForm(!showHolidayForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg">
              <Plus className="w-4 h-4" /> Add Holiday
            </button>
          </div>

          {showHolidayForm && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Add Company Holiday</h3>
              <div className="grid grid-cols-2 gap-4">
                <HRField label="Holiday Name">
                  <input value={holidayForm.name} onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="e.g. Diwali" className={inputCls} />
                </HRField>
                <HRField label="Date">
                  <input type="date" value={holidayForm.date} onChange={e => setHolidayForm({ ...holidayForm, date: e.target.value })} className={inputCls} />
                </HRField>
                <HRField label="Type">
                  <select value={holidayForm.holiday_type} onChange={e => setHolidayForm({ ...holidayForm, holiday_type: e.target.value })} className={inputCls}>
                    <option value="public">Public Holiday</option>
                    <option value="optional">Optional Holiday</option>
                    <option value="company">Company Holiday</option>
                  </select>
                </HRField>
                <HRField label="Description (optional)">
                  <input value={holidayForm.description} onChange={e => setHolidayForm({ ...holidayForm, description: e.target.value })} placeholder="Brief note" className={inputCls} />
                </HRField>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={addHoliday} disabled={saving || !holidayForm.name || !holidayForm.date}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-60">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add Holiday
                </button>
                <button onClick={() => setShowHolidayForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {holidays.length === 0 ? (
              <p className="text-sm text-slate-400 p-6">No holidays added yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Date", "Holiday", "Type", "Description", ""].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holidays.map(h => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {new Date(h.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{h.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.holiday_type === "public" ? "bg-blue-100 text-blue-700" : h.holiday_type === "optional" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                          {h.holiday_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{h.description || "—"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteHoliday(h.id)} className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── ALL LEAVE APPROVALS ── */}
      {hrTab === "leaves" && (
        <div className="space-y-4">
          <div className="flex gap-1 flex-wrap">
            {[
              { v: "pending", label: "Pending" },
              { v: "approved", label: "Approved" },
              { v: "rejected", label: "Rejected" },
              { v: "all", label: "All" },
            ].map(f => (
              <button key={f.v} onClick={() => setLeaveFilter(f.v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${leaveFilter === f.v ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-300"}`}>
                {f.label}
                <span className="ml-1.5 text-xs opacity-70">
                  {f.v === "all" ? leaves.length : leaves.filter(l => l.status === f.v).length}
                </span>
              </button>
            ))}
          </div>

          {filteredLeaves.length === 0 ? (
            <p className="text-sm text-slate-400">No leave requests.</p>
          ) : (
            <div className="space-y-2">
              {filteredLeaves.map(l => (
                <AdminLeaveCard key={l.id} leave={l} onUpdate={updateLeave} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminLeaveCard({ leave, onUpdate }: { leave: LeaveApplication; onUpdate: (id: string, status: "approved" | "rejected", reason?: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const p = leave.profiles as unknown as Profile;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm shrink-0">
          {p?.full_name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-800">{p?.full_name}</p>
            <span className="text-xs text-slate-400">{p?.designation}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEAVE_COLORS[leave.leave_type]}`}>
              {LEAVE_TYPES[leave.leave_type]}
            </span>
            <span className="text-xs text-slate-600">
              {new Date(leave.from_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              {leave.from_date !== leave.to_date && ` – ${new Date(leave.to_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
              {leave.from_date === leave.to_date && ` ${new Date(leave.from_date).getFullYear()}`}
              {` · ${leave.days}d`}
            </span>
            <span className="text-xs text-slate-400">Applied {new Date(leave.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          </div>
          {leave.reason && <p className="text-xs text-slate-500 mt-1">{leave.reason}</p>}
          {leave.rejection_reason && <p className="text-xs text-rose-500 mt-1">Rejection reason: {leave.rejection_reason}</p>}
          {(leave.approver as unknown as Profile)?.full_name && (
            <p className="text-xs text-slate-400 mt-1">{leave.status === "approved" ? "Approved" : "Rejected"} by {(leave.approver as unknown as Profile).full_name}</p>
          )}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[leave.status]}`}>
          {leave.status}
        </span>
      </div>
      {leave.status === "pending" && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          {!rejecting ? (
            <div className="flex gap-2">
              <button onClick={() => onUpdate(leave.id, "approved")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
              </button>
              <button onClick={() => setRejecting(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium rounded-lg border border-rose-200">
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Rejection reason (optional)"
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400" />
              <div className="flex gap-2">
                <button onClick={() => { onUpdate(leave.id, "rejected", reason); setRejecting(false); }}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg">Confirm Reject</button>
                <button onClick={() => setRejecting(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HRField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all";
