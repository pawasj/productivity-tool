"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import type { Profile, LeaveApplication, CompanyHoliday, AppModule, EmployeeBankDetails } from "@/lib/types";
import { ALL_MODULES, MODULE_LABELS } from "@/lib/types";
import {
  Users, Calendar, ClipboardList, Save, Plus, Trash2,
  CheckCircle2, XCircle, Loader2, AlertCircle,
  Landmark, FileSpreadsheet, Download, ExternalLink, Search, ShieldAlert,
} from "lucide-react";

const HR_TABS = [
  { id: "team", label: "Team Management", icon: Users },
  { id: "holidays", label: "Holiday Calendar", icon: Calendar },
  { id: "leaves", label: "All Leave Approvals", icon: ClipboardList },
  { id: "bank", label: "Bank Details", icon: Landmark },
];

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-Time", part_time: "Part-Time",
  contract: "Contract", intern: "Intern", freelancer: "Freelancer",
};

// Column order is shared by the on-screen table, the Google Sheet and the CSV
const BANK_COLUMNS = [
  "Employee ID", "Name", "Email", "Designation", "Department", "Employment Type",
  "Account Holder Name", "Bank Name", "Account Number", "IFSC Code", "Branch",
  "Account Type", "UPI ID", "Details Last Updated",
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
  const [banks, setBanks] = useState<EmployeeBankDetails[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");

  useEffect(() => {
    if (hrTab === "leaves") fetchLeaves();
    if (hrTab === "holidays") fetchHolidays();
    if (hrTab === "bank") fetchBanks();
  }, [hrTab]);

  async function fetchLeaves() {
    const { data } = await supabase.from("leave_applications")
      .select("*, profiles:user_id(full_name, email, reporting_manager_id), approver:approved_by(full_name)")
      .order("created_at", { ascending: false });
    setLeaves((data || []) as LeaveApplication[]);
  }

  async function fetchBanks() {
    setBankLoading(true);
    // RLS already limits this to admins; this component is admin-only anyway
    const { data, error } = await supabase.from("employee_bank_details").select("*");
    if (error) setMsg({ type: "error", text: `Couldn't load bank details: ${error.message}` });
    setBanks((data || []) as EmployeeBankDetails[]);
    setBankLoading(false);
  }

  // One row per team member, blank where they have not filled details in
  function bankRows() {
    const byUser = new Map(banks.map(b => [b.user_id, b]));
    return members.map(m => {
      const b = (byUser.get(m.id) || {}) as Partial<EmployeeBankDetails>;
      return {
        member: m,
        cells: [
          m.employee_id || "",
          m.full_name || "",
          m.email || "",
          m.designation || "",
          m.department || "",
          EMPLOYMENT_LABELS[m.employment_type as string] || m.employment_type || "",
          b.account_holder_name || "",
          b.bank_name || "",
          b.account_number || "",
          b.ifsc_code || "",
          b.branch_name || "",
          b.account_type ? b.account_type.charAt(0).toUpperCase() + b.account_type.slice(1) : "",
          b.upi_id || "",
          b.updated_at ? new Date(b.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "",
        ] as string[],
        hasDetails: Boolean(b.account_number || b.upi_id),
      };
    });
  }

  async function exportBankSheet() {
    setExporting(true);
    setSheetUrl("");
    try {
      const res = await fetch("/api/admin/export-bank-sheet", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) {
        setMsg({ type: "error", text: json.error || `Export failed (${res.status})` });
      } else {
        setSheetUrl(json.url);
        setMsg({
          type: "success",
          text: `Sheet created — ${json.rows} members, ${json.withDetails} with details${json.missing ? `, ${json.missing} missing` : ""}.`,
        });
        window.open(json.url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setMsg({ type: "error", text: `Export failed: ${(e as Error).message}` });
    }
    setExporting(false);
  }

  // Offline fallback — also what to use when Google is not connected
  function downloadBankCsv() {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      BANK_COLUMNS.map(esc).join(","),
      ...bankRows().map(r => r.cells.map(esc).join(",")),
    ];
    // BOM keeps Excel happy with the ₹ symbol and Indian names
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bcc-bank-details-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
      access_levels: editingMember.access_levels || [],
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
              {/* Access Levels */}
              <div className="mt-5 pt-5 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Module Access</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {ALL_MODULES.map(mod => {
                    const checked = (editingMember.access_levels || []).includes(mod);
                    return (
                      <label key={mod} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${checked ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                        <input type="checkbox" checked={checked}
                          onChange={e => {
                            const cur = editingMember.access_levels || [];
                            setEditingMember({
                              ...editingMember,
                              access_levels: e.target.checked ? [...cur, mod] : cur.filter(m => m !== mod),
                            });
                          }}
                          className="w-3.5 h-3.5 rounded accent-indigo-600" />
                        <span className={`text-xs font-medium ${checked ? "text-indigo-700" : "text-slate-600"}`}>{MODULE_LABELS[mod]}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-2">Admins automatically have full access regardless of selection.</p>
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
                    {["Employee", "Designation / Dept", "Team", "Reporting To", "Role", "Module Access", "Joined", ""].map(h => (
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
                        <td className="px-4 py-3">
                          {m.role === "admin" ? (
                            <span className="text-xs text-indigo-500 font-medium">All modules</span>
                          ) : (m.access_levels?.length ?? 0) > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(m.access_levels || []).map(mod => (
                                <span key={mod} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                  {MODULE_LABELS[mod as AppModule]}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">No access set</span>
                          )}
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

      {/* ── BANK DETAILS ── */}
      {hrTab === "bank" && (() => {
        const rows = bankRows();
        const q = bankSearch.trim().toLowerCase();
        const visible = q
          ? rows.filter(r => r.cells.some(c => c.toLowerCase().includes(q)))
          : rows;
        const withDetails = rows.filter(r => r.hasDetails).length;
        const missing = rows.length - withDetails;

        return (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-indigo-500" />
                    Team Bank Details
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {rows.length} team members · <span className="text-emerald-600 font-medium">{withDetails} with payout details</span>
                    {missing > 0 && <> · <span className="text-amber-600 font-medium">{missing} missing</span></>}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={downloadBankCsv} disabled={rows.length === 0}
                    title="Download as CSV — opens in Excel or Google Sheets"
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                  <button onClick={exportBankSheet} disabled={exporting || rows.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-60">
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                    {exporting ? "Creating sheet…" : "Download as Google Sheet"}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2 mt-4 px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  Payout information. The exported sheet is created in your own Google Drive and is private until you share it —
                  keep it that way, and share only with finance.
                </p>
              </div>

              {sheetUrl && (
                <a href={sheetUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                  <ExternalLink className="w-3.5 h-3.5" /> Open the sheet that was just created
                </a>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input value={bankSearch} onChange={e => setBankSearch(e.target.value)}
                    placeholder="Search name, bank, account…"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {bankLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>
              ) : visible.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-sm">
                  <Landmark className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  {rows.length === 0 ? "No team members yet." : "No matches."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        {BANK_COLUMNS.map(c => (
                          <th key={c} className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {visible.map(r => (
                        <tr key={r.member.id} className={`hover:bg-slate-50/60 transition-colors ${r.hasDetails ? "" : "bg-amber-50/40"}`}>
                          {r.cells.map((c, i) => (
                            <td key={i} className={`px-3 py-2.5 ${i === 1 ? "font-medium text-slate-900" : "text-slate-600"} ${[8, 9, 12].includes(i) ? "font-mono text-xs" : ""}`}>
                              {c || <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {missing > 0 && (
                <p className="px-4 py-2.5 text-[11px] text-slate-400 border-t border-slate-100">
                  Rows tinted amber have no account number or UPI ID — those people cannot be paid until they fill in Bank &amp; Payroll under My Profile.
                </p>
              )}
            </div>
          </div>
        );
      })()}
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
