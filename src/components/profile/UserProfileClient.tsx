"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import type {
  Profile, EmployeeDetails, EmployeeBankDetails,
  EmployeeDocument, LeaveApplication, AttendanceLog, CompanyHoliday,
} from "@/lib/types";
import {
  User, MapPin, CreditCard, FileText, Calendar, ClipboardList,
  Save, Upload, Check, X, AlertCircle, Eye, EyeOff, ChevronDown,
  Briefcase, Phone, Mail, Heart, Home, Building2, Clock,
  CheckCircle2, XCircle, Loader2, Trash2, Download, Shield,
} from "lucide-react";

const TABS = [
  { id: "profile", label: "My Profile", icon: User },
  { id: "personal", label: "Personal", icon: Heart },
  { id: "address", label: "Address", icon: MapPin },
  { id: "bank", label: "Bank & Payroll", icon: CreditCard },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "leaves", label: "Leaves & Attendance", icon: ClipboardList },
  { id: "calendar", label: "Calendar", icon: Calendar },
];

const LEAVE_TYPES = [
  { value: "casual", label: "Casual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "earned", label: "Earned Leave" },
  { value: "wfh", label: "Work From Home" },
  { value: "half_day", label: "Half Day" },
  { value: "optional", label: "Optional Holiday" },
];

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

const ATTENDANCE_COLORS: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700",
  absent: "bg-rose-100 text-rose-700",
  wfh: "bg-violet-100 text-violet-700",
  half_day: "bg-amber-100 text-amber-700",
  on_leave: "bg-blue-100 text-blue-700",
  holiday: "bg-slate-100 text-slate-500",
};

interface Props {
  profile: Profile;
  members: Profile[];
  calConnected?: boolean;
}

export default function UserProfileClient({ profile: initProfile, members, calConnected }: Props) {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState("profile");
  const [profile, setProfile] = useState<Profile>(initProfile);
  const [details, setDetails] = useState<Partial<EmployeeDetails>>({});
  const [bank, setBank] = useState<Partial<EmployeeBankDetails>>({});
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [teamLeaves, setTeamLeaves] = useState<LeaveApplication[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [leaveForm, setLeaveForm] = useState({ leave_type: "casual", from_date: "", to_date: "", reason: "" });
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState<string>("aadhar");
  const [uploadDocLabel, setUploadDocLabel] = useState("");

  // Detect if current user is a reporting manager
  const isReportingManager = members.some(m => m.reporting_manager_id === profile.id);

  useEffect(() => {
    fetchDetails();
    fetchBank();
    fetchDocuments();
    fetchLeaves();
    fetchAttendance();
    fetchHolidays();
    if (isReportingManager) fetchTeamLeaves();
  }, []);

  async function fetchDetails() {
    const { data } = await supabase.from("employee_details").select("*").eq("user_id", profile.id).single();
    if (data) setDetails(data);
  }
  async function fetchBank() {
    const { data } = await supabase.from("employee_bank_details").select("*").eq("user_id", profile.id).single();
    if (data) setBank(data);
  }
  async function fetchDocuments() {
    const { data } = await supabase.from("employee_documents").select("*").eq("user_id", profile.id).order("uploaded_at", { ascending: false });
    setDocuments((data || []) as EmployeeDocument[]);
  }
  async function fetchLeaves() {
    const { data } = await supabase.from("leave_applications").select("*, approver:approved_by(full_name)").eq("user_id", profile.id).order("created_at", { ascending: false });
    setLeaves((data || []) as LeaveApplication[]);
  }
  async function fetchAttendance() {
    const [year, month] = attendanceMonth.split("-");
    const from = `${year}-${month}-01`;
    const to = new Date(Number(year), Number(month), 0).toISOString().slice(0, 10);
    const { data } = await supabase.from("attendance_logs").select("*").eq("user_id", profile.id).gte("date", from).lte("date", to).order("date", { ascending: false });
    setAttendance((data || []) as AttendanceLog[]);
  }
  async function fetchHolidays() {
    const { data } = await supabase.from("company_holidays").select("*").order("date");
    setHolidays((data || []) as CompanyHoliday[]);
  }
  async function fetchTeamLeaves() {
    const { data } = await supabase.from("leave_applications")
      .select("*, profiles:user_id(full_name, email, designation), approver:approved_by(full_name)")
      .order("created_at", { ascending: false });
    const myTeam = members.filter(m => m.reporting_manager_id === profile.id).map(m => m.id);
    setTeamLeaves(((data || []) as LeaveApplication[]).filter(l => myTeam.includes(l.user_id)));
  }

  function flash(type: "success" | "error", text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  }

  // ── Save Profile ──────────────────────────────────────────────────────────
  async function saveProfile() {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: profile.full_name,
      phone: profile.phone,
      designation: profile.designation,
      department: profile.department,
    }).eq("id", profile.id);
    setSaving(false);
    if (error) flash("error", error.message);
    else flash("success", "Profile saved");
  }

  // ── Save Personal Details ─────────────────────────────────────────────────
  async function saveDetails() {
    setSaving(true);
    const payload = { ...details, user_id: profile.id, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("employee_details").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) flash("error", error.message);
    else flash("success", "Personal details saved");
  }

  // ── Save Bank Details ─────────────────────────────────────────────────────
  async function saveBank() {
    setSaving(true);
    const payload = { ...bank, user_id: profile.id, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("employee_bank_details").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) flash("error", error.message);
    else flash("success", "Bank details saved");
  }

  // ── Upload Document ───────────────────────────────────────────────────────
  async function uploadDocument(file: File) {
    setUploading(uploadDocType);
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/${uploadDocType}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("employee-docs").upload(path, file);
    if (upErr) { flash("error", upErr.message); setUploading(null); return; }

    const { data: urlData } = supabase.storage.from("employee-docs").getPublicUrl(path);
    const { error: dbErr } = await supabase.from("employee_documents").insert({
      user_id: profile.id,
      doc_type: uploadDocType,
      doc_label: uploadDocLabel || uploadDocType.toUpperCase(),
      file_url: urlData.publicUrl,
      file_path: path,
    });
    setUploading(null);
    if (dbErr) flash("error", dbErr.message);
    else { flash("success", "Document uploaded"); fetchDocuments(); setUploadDocLabel(""); }
  }

  async function deleteDocument(doc: EmployeeDocument) {
    if (!confirm("Delete this document?")) return;
    if (doc.file_path) await supabase.storage.from("employee-docs").remove([doc.file_path]);
    await supabase.from("employee_documents").delete().eq("id", doc.id);
    fetchDocuments();
  }

  // ── Leave Application ────────────────────────────────────────────────────
  async function applyLeave() {
    if (!leaveForm.from_date || !leaveForm.to_date) return;
    setSaving(true);
    const from = new Date(leaveForm.from_date);
    const to = new Date(leaveForm.to_date);
    const days = leaveForm.leave_type === "half_day" ? 0.5
      : Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
    const { error } = await supabase.from("leave_applications").insert({
      user_id: profile.id,
      ...leaveForm,
      days,
    });
    setSaving(false);
    if (error) flash("error", error.message);
    else { flash("success", "Leave applied"); setShowLeaveForm(false); setLeaveForm({ leave_type: "casual", from_date: "", to_date: "", reason: "" }); fetchLeaves(); }
  }

  async function cancelLeave(id: string) {
    await supabase.from("leave_applications").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id);
    fetchLeaves();
  }

  async function approveLeave(id: string, approve: boolean, rejectionReason?: string) {
    await supabase.from("leave_applications").update({
      status: approve ? "approved" : "rejected",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      rejection_reason: rejectionReason || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    fetchTeamLeaves();
  }

  // ── Add Attendance ───────────────────────────────────────────────────────
  async function logAttendance(date: string, status: string) {
    await supabase.from("attendance_logs").upsert(
      { user_id: profile.id, date, status, updated_at: new Date().toISOString() },
      { onConflict: "user_id,date" }
    );
    fetchAttendance();
  }

  const tabs = [...TABS];
  if (isReportingManager) tabs.push({ id: "team", label: "Team Leaves", icon: Briefcase });

  const manager = members.find(m => m.id === profile.reporting_manager_id);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl shrink-0">
            {profile.full_name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{profile.full_name}</h1>
            <p className="text-sm text-slate-500">{profile.designation || "—"} {profile.department ? `· ${profile.department}` : ""} {profile.team ? `· ${profile.team}` : ""}</p>
            {profile.employee_id && <p className="text-xs text-slate-400 mt-0.5">ID: {profile.employee_id}</p>}
          </div>
          {msg && (
            <div className={`ml-auto flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg ${msg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {msg.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {msg.text}
            </div>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-4 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === t.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── MY PROFILE ── */}
        {activeTab === "profile" && (
          <div className="max-w-2xl space-y-6">
            <Section title="Work Information" icon={Briefcase}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full Name">
                  <input value={profile.full_name} onChange={e => setProfile({ ...profile, full_name: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Work Email">
                  <input value={profile.email} disabled className={`${inputCls} bg-slate-50 text-slate-400`} />
                </Field>
                <Field label="Phone Number">
                  <input value={profile.phone || ""} onChange={e => setProfile({ ...profile, phone: e.target.value })} placeholder="+91 98765 43210" className={inputCls} />
                </Field>
                <Field label="Designation">
                  <input value={profile.designation || ""} onChange={e => setProfile({ ...profile, designation: e.target.value })} placeholder="e.g. Senior Manager" className={inputCls} />
                </Field>
                <Field label="Department">
                  <input value={profile.department || ""} onChange={e => setProfile({ ...profile, department: e.target.value })} placeholder="e.g. Marketing" className={inputCls} />
                </Field>
                <Field label="Employee ID">
                  <input value={profile.employee_id || ""} disabled className={`${inputCls} bg-slate-50 text-slate-400`} />
                </Field>
                <Field label="Date of Joining">
                  <input value={profile.date_of_joining || ""} disabled className={`${inputCls} bg-slate-50 text-slate-400`} />
                </Field>
                <Field label="Employment Type">
                  <input value={profile.employment_type?.replace("_", " ") || "Full Time"} disabled className={`${inputCls} bg-slate-50 text-slate-400 capitalize`} />
                </Field>
              </div>
              {manager && (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                  <User className="w-4 h-4 text-slate-400" />
                  Reporting to: <span className="font-medium">{manager.full_name}</span>
                  {manager.designation && <span className="text-slate-400">({manager.designation})</span>}
                </div>
              )}
              <SaveButton onClick={saveProfile} saving={saving} />
            </Section>
          </div>
        )}

        {/* ── PERSONAL ── */}
        {activeTab === "personal" && (
          <div className="max-w-2xl space-y-6">
            <Section title="Personal Information" icon={User}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Personal Email">
                  <input type="email" value={details.personal_email || ""} onChange={e => setDetails({ ...details, personal_email: e.target.value })} placeholder="personal@email.com" className={inputCls} />
                </Field>
                <Field label="Date of Birth">
                  <input type="date" value={details.date_of_birth || ""} onChange={e => setDetails({ ...details, date_of_birth: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Gender">
                  <select value={details.gender || ""} onChange={e => setDetails({ ...details, gender: e.target.value })} className={inputCls}>
                    <option value="">Select</option>
                    <option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option>
                  </select>
                </Field>
                <Field label="Blood Group">
                  <select value={details.blood_group || ""} onChange={e => setDetails({ ...details, blood_group: e.target.value })} className={inputCls}>
                    <option value="">Select</option>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(g => <option key={g}>{g}</option>)}
                  </select>
                </Field>
              </div>
              <SaveButton onClick={saveDetails} saving={saving} />
            </Section>

            <Section title="Emergency Contact" icon={Phone}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contact Name">
                  <input value={details.emergency_contact_name || ""} onChange={e => setDetails({ ...details, emergency_contact_name: e.target.value })} placeholder="Full name" className={inputCls} />
                </Field>
                <Field label="Relationship">
                  <input value={details.emergency_contact_relation || ""} onChange={e => setDetails({ ...details, emergency_contact_relation: e.target.value })} placeholder="e.g. Spouse, Parent" className={inputCls} />
                </Field>
                <Field label="Phone Number">
                  <input value={details.emergency_contact_phone || ""} onChange={e => setDetails({ ...details, emergency_contact_phone: e.target.value })} placeholder="+91 98765 43210" className={inputCls} />
                </Field>
              </div>
              <SaveButton onClick={saveDetails} saving={saving} />
            </Section>
          </div>
        )}

        {/* ── ADDRESS ── */}
        {activeTab === "address" && (
          <div className="max-w-2xl space-y-6">
            <Section title="Permanent Address" icon={Home}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Address Line 1" className="col-span-2">
                  <input value={details.permanent_address_line1 || ""} onChange={e => setDetails({ ...details, permanent_address_line1: e.target.value })} placeholder="House / Flat No., Street" className={inputCls} />
                </Field>
                <Field label="Address Line 2" className="col-span-2">
                  <input value={details.permanent_address_line2 || ""} onChange={e => setDetails({ ...details, permanent_address_line2: e.target.value })} placeholder="Area, Landmark" className={inputCls} />
                </Field>
                <Field label="City">
                  <input value={details.permanent_city || ""} onChange={e => setDetails({ ...details, permanent_city: e.target.value })} placeholder="City" className={inputCls} />
                </Field>
                <Field label="State">
                  <input value={details.permanent_state || ""} onChange={e => setDetails({ ...details, permanent_state: e.target.value })} placeholder="State" className={inputCls} />
                </Field>
                <Field label="Pincode">
                  <input value={details.permanent_pincode || ""} onChange={e => setDetails({ ...details, permanent_pincode: e.target.value })} placeholder="110001" className={inputCls} />
                </Field>
                <Field label="Country">
                  <input value={details.permanent_country || "India"} onChange={e => setDetails({ ...details, permanent_country: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <SaveButton onClick={saveDetails} saving={saving} />
            </Section>

            <Section title="Correspondence Address" icon={Building2}>
              <label className="flex items-center gap-2 text-sm text-slate-600 mb-4 cursor-pointer">
                <input type="checkbox" checked={details.same_as_permanent || false}
                  onChange={e => setDetails({ ...details, same_as_permanent: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600" />
                Same as permanent address
              </label>
              {!details.same_as_permanent && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Address Line 1" className="col-span-2">
                    <input value={details.corr_address_line1 || ""} onChange={e => setDetails({ ...details, corr_address_line1: e.target.value })} placeholder="House / Flat No., Street" className={inputCls} />
                  </Field>
                  <Field label="Address Line 2" className="col-span-2">
                    <input value={details.corr_address_line2 || ""} onChange={e => setDetails({ ...details, corr_address_line2: e.target.value })} placeholder="Area, Landmark" className={inputCls} />
                  </Field>
                  <Field label="City">
                    <input value={details.corr_city || ""} onChange={e => setDetails({ ...details, corr_city: e.target.value })} placeholder="City" className={inputCls} />
                  </Field>
                  <Field label="State">
                    <input value={details.corr_state || ""} onChange={e => setDetails({ ...details, corr_state: e.target.value })} placeholder="State" className={inputCls} />
                  </Field>
                  <Field label="Pincode">
                    <input value={details.corr_pincode || ""} onChange={e => setDetails({ ...details, corr_pincode: e.target.value })} placeholder="110001" className={inputCls} />
                  </Field>
                  <Field label="Country">
                    <input value={details.corr_country || "India"} onChange={e => setDetails({ ...details, corr_country: e.target.value })} className={inputCls} />
                  </Field>
                </div>
              )}
              <SaveButton onClick={saveDetails} saving={saving} />
            </Section>
          </div>
        )}

        {/* ── BANK & PAYROLL ── */}
        {activeTab === "bank" && (
          <div className="max-w-2xl space-y-6">
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <Shield className="w-4 h-4 shrink-0" />
              This information is encrypted and only visible to you and your HR admin.
            </div>
            <Section title="Bank Account Details" icon={CreditCard}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Account Holder Name" className="col-span-2">
                  <input value={bank.account_holder_name || ""} onChange={e => setBank({ ...bank, account_holder_name: e.target.value })} placeholder="As per bank records" className={inputCls} />
                </Field>
                <Field label="Bank Name">
                  <input value={bank.bank_name || ""} onChange={e => setBank({ ...bank, bank_name: e.target.value })} placeholder="e.g. HDFC Bank" className={inputCls} />
                </Field>
                <Field label="Account Type">
                  <select value={bank.account_type || "savings"} onChange={e => setBank({ ...bank, account_type: e.target.value as "savings" | "current" })} className={inputCls}>
                    <option value="savings">Savings</option>
                    <option value="current">Current</option>
                  </select>
                </Field>
                <Field label="Account Number" className="col-span-2">
                  <div className="relative">
                    <input
                      type={showAccountNumber ? "text" : "password"}
                      value={bank.account_number || ""}
                      onChange={e => setBank({ ...bank, account_number: e.target.value })}
                      placeholder="Account number"
                      className={`${inputCls} pr-10`}
                    />
                    <button type="button" onClick={() => setShowAccountNumber(!showAccountNumber)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showAccountNumber ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
                <Field label="IFSC Code">
                  <input value={bank.ifsc_code || ""} onChange={e => setBank({ ...bank, ifsc_code: e.target.value.toUpperCase() })} placeholder="e.g. HDFC0001234" className={inputCls} />
                </Field>
                <Field label="Branch Name">
                  <input value={bank.branch_name || ""} onChange={e => setBank({ ...bank, branch_name: e.target.value })} placeholder="Branch" className={inputCls} />
                </Field>
                <Field label="UPI ID">
                  <input value={bank.upi_id || ""} onChange={e => setBank({ ...bank, upi_id: e.target.value })} placeholder="name@upi" className={inputCls} />
                </Field>
              </div>
              <SaveButton onClick={saveBank} saving={saving} />
            </Section>
          </div>
        )}

        {/* ── DOCUMENTS ── */}
        {activeTab === "documents" && (
          <div className="max-w-2xl space-y-6">
            {/* Upload */}
            <Section title="Upload Document" icon={Upload}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Field label="Document Type">
                  <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value)} className={inputCls}>
                    <option value="aadhar">Aadhar Card</option>
                    <option value="pan">PAN Card</option>
                    <option value="passport">Passport</option>
                    <option value="offer_letter">Offer Letter</option>
                    <option value="nda">NDA</option>
                    <option value="relieving_letter">Relieving Letter</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Label (optional)">
                  <input value={uploadDocLabel} onChange={e => setUploadDocLabel(e.target.value)} placeholder="e.g. Aadhar Front+Back" className={inputCls} />
                </Field>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f); e.target.value = ""; }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={!!uploading}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Uploading…" : "Choose File to Upload"}
              </button>
              <p className="text-xs text-slate-400 mt-2">Accepted: PDF, JPG, PNG · Max 5MB per file</p>
            </Section>

            {/* Document List */}
            <Section title="Uploaded Documents" icon={FileText}>
              {documents.length === 0 ? (
                <p className="text-sm text-slate-400">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{doc.doc_label || doc.doc_type.toUpperCase()}</p>
                        <p className="text-xs text-slate-400">{new Date(doc.uploaded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                      </div>
                      {doc.verified && (
                        <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Verified
                        </span>
                      )}
                      <div className="flex gap-1">
                        {doc.file_url && (
                          <a href={doc.file_url} target="_blank" rel="noreferrer"
                            className="p-1.5 hover:bg-slate-200 rounded transition-colors text-slate-500 hover:text-slate-700">
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        <button onClick={() => deleteDocument(doc)} className="p-1.5 hover:bg-rose-50 rounded transition-colors text-slate-400 hover:text-rose-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}

        {/* ── LEAVES & ATTENDANCE ── */}
        {activeTab === "leaves" && (
          <div className="max-w-3xl space-y-6">
            {/* Leave Summary */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Casual", type: "casual", color: "blue" },
                { label: "Sick", type: "sick", color: "rose" },
                { label: "WFH", type: "wfh", color: "violet" },
                { label: "Earned", type: "earned", color: "emerald" },
              ].map(({ label, type, color }) => {
                const count = leaves.filter(l => l.leave_type === type && l.status === "approved").reduce((s, l) => s + l.days, 0);
                return (
                  <div key={type} className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500">{label} Leave Used</p>
                    <p className={`text-2xl font-bold text-${color}-600 mt-1`}>{count}</p>
                    <p className="text-xs text-slate-400">days approved</p>
                  </div>
                );
              })}
            </div>

            {/* Apply Leave */}
            <Section title="Leave Applications" icon={ClipboardList}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">Your leave history</p>
                <button onClick={() => setShowLeaveForm(!showLeaveForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                  <ChevronDown className={`w-4 h-4 transition-transform ${showLeaveForm ? "rotate-180" : ""}`} />
                  Apply Leave
                </button>
              </div>

              {showLeaveForm && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Leave Type">
                      <select value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })} className={inputCls}>
                        {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                    <div />
                    <Field label="From Date">
                      <input type="date" value={leaveForm.from_date} onChange={e => setLeaveForm({ ...leaveForm, from_date: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="To Date">
                      <input type="date" value={leaveForm.to_date} min={leaveForm.from_date} onChange={e => setLeaveForm({ ...leaveForm, to_date: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Reason" className="col-span-2">
                      <textarea value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} rows={2} placeholder="Brief reason for leave" className={`${inputCls} resize-none`} />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={applyLeave} disabled={saving || !leaveForm.from_date || !leaveForm.to_date}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-60">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Submit
                    </button>
                    <button onClick={() => setShowLeaveForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-white rounded-lg">Cancel</button>
                  </div>
                </div>
              )}

              {leaves.length === 0 ? (
                <p className="text-sm text-slate-400">No leave applications yet.</p>
              ) : (
                <div className="space-y-2">
                  {leaves.map(l => (
                    <div key={l.id} className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${LEAVE_COLORS[l.leave_type]}`}>
                        {LEAVE_TYPES.find(t => t.value === l.leave_type)?.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {new Date(l.from_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          {l.from_date !== l.to_date && ` – ${new Date(l.to_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                          {l.from_date === l.to_date && ` ${new Date(l.from_date).getFullYear()}`}
                          <span className="text-slate-400 font-normal ml-1">({l.days}d)</span>
                        </p>
                        {l.reason && <p className="text-xs text-slate-400 mt-0.5">{l.reason}</p>}
                        {l.rejection_reason && <p className="text-xs text-rose-500 mt-0.5">Reason: {l.rejection_reason}</p>}
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[l.status]}`}>
                        {l.status}
                      </span>
                      {l.status === "pending" && (
                        <button onClick={() => cancelLeave(l.id)} className="text-xs text-slate-400 hover:text-rose-600 shrink-0">Cancel</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Attendance Log */}
            <Section title="Attendance Log" icon={Clock}>
              <div className="flex items-center gap-3 mb-4">
                <label className="text-sm text-slate-600">Month:</label>
                <input type="month" value={attendanceMonth} onChange={e => { setAttendanceMonth(e.target.value); setTimeout(fetchAttendance, 0); }} className={`${inputCls} w-40`} />
                <button onClick={() => logAttendance(new Date().toISOString().slice(0, 10), "present")}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg">
                  <Check className="w-3.5 h-3.5" /> Mark Today Present
                </button>
                <button onClick={() => logAttendance(new Date().toISOString().slice(0, 10), "wfh")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg">
                  <Home className="w-3.5 h-3.5" /> WFH Today
                </button>
              </div>
              {attendance.length === 0 ? (
                <p className="text-sm text-slate-400">No attendance records for this month.</p>
              ) : (
                <div className="space-y-1.5">
                  {attendance.map(a => (
                    <div key={a.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-500 w-32 shrink-0">
                        {new Date(a.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ATTENDANCE_COLORS[a.status]}`}>
                        {a.status.replace("_", " ")}
                      </span>
                      {a.check_in && <span className="text-xs text-slate-400">In: {a.check_in}</span>}
                      {a.check_out && <span className="text-xs text-slate-400">Out: {a.check_out}</span>}
                      {a.notes && <span className="text-xs text-slate-400 ml-auto">{a.notes}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Upcoming Holidays */}
            {holidays.length > 0 && (
              <Section title="Company Holidays" icon={Calendar}>
                <div className="space-y-1.5">
                  {holidays.filter(h => new Date(h.date) >= new Date()).slice(0, 8).map(h => (
                    <div key={h.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
                      <span className="text-sm font-medium text-slate-700 w-32 shrink-0">
                        {new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span className="text-sm text-slate-800">{h.name}</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${h.holiday_type === "public" ? "bg-blue-100 text-blue-700" : h.holiday_type === "optional" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                        {h.holiday_type}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ── GOOGLE CALENDAR ── */}
        {activeTab === "calendar" && (
          <div className="max-w-xl space-y-4">
            <Section title="Google Calendar" icon={Calendar}>
              {calConnected || profile.google_calendar_email ? (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Calendar Connected</p>
                    <p className="text-xs text-emerald-600 mt-0.5">{profile.google_calendar_email}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">Connect your Google Calendar to see upcoming meetings and events in your dashboard.</p>
                  <a href="/api/auth/google-calendar" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-lg text-sm font-medium text-slate-700 transition-colors shadow-sm">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Connect Google Calendar
                  </a>
                </div>
              )}
            </Section>
          </div>
        )}

        {/* ── TEAM LEAVES (reporting managers) ── */}
        {activeTab === "team" && isReportingManager && (
          <div className="max-w-3xl">
            <Section title="Team Leave Requests" icon={Briefcase}>
              {teamLeaves.length === 0 ? (
                <p className="text-sm text-slate-400">No leave requests from your team.</p>
              ) : (
                <div className="space-y-3">
                  {teamLeaves.map(l => (
                    <TeamLeaveCard key={l.id} leave={l} onApprove={(id) => approveLeave(id, true)} onReject={(id, r) => approveLeave(id, false, r)} />
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TeamLeaveCard({ leave, onApprove, onReject }: { leave: LeaveApplication; onApprove: (id: string) => void; onReject: (id: string, reason: string) => void }) {
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
          <p className="text-sm font-medium text-slate-800">{p?.full_name}</p>
          <p className="text-xs text-slate-400">{p?.designation}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEAVE_COLORS[leave.leave_type]}`}>
              {LEAVE_TYPES.find(t => t.value === leave.leave_type)?.label}
            </span>
            <span className="text-xs text-slate-600">
              {new Date(leave.from_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              {leave.from_date !== leave.to_date && ` – ${new Date(leave.to_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
              {leave.from_date === leave.to_date && ` ${new Date(leave.from_date).getFullYear()}`}
              {` (${leave.days}d)`}
            </span>
          </div>
          {leave.reason && <p className="text-xs text-slate-500 mt-1">{leave.reason}</p>}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[leave.status]}`}>
          {leave.status}
        </span>
      </div>
      {leave.status === "pending" && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          {!rejecting ? (
            <div className="flex gap-2">
              <button onClick={() => onApprove(leave.id)}
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
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for rejection (optional)" className={`${inputCls} text-xs`} />
              <div className="flex gap-2">
                <button onClick={() => { onReject(leave.id, reason); setRejecting(false); }}
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

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-5">
        <Icon className="w-4 h-4 text-indigo-500" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SaveButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="mt-5 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      Save Changes
    </button>
  );
}

const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all";
