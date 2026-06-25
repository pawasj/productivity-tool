"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Shield, UserPlus, Users, Mail, X, Check, Crown, User, Calendar, Link2, CheckCircle2, AlertCircle, Settings, Briefcase } from "lucide-react";
import type { Profile, AppModule } from "@/lib/types";
import { ALL_MODULES, MODULE_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import HRAdminClient from "@/components/admin/HRAdminClient";

interface Props { members: Profile[]; currentUser: Profile; }

export default function AdminClient({ members: initialMembers, currentUser }: Props) {
  const [adminTab, setAdminTab] = useState<"team" | "hr">("team");
  const [members, setMembers] = useState<Profile[]>(initialMembers);
  const [calConnected, setCalConnected] = useState(!!currentUser.google_calendar_email);
  const [calEmail, setCalEmail] = useState(currentUser.google_calendar_email || "");
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("cal_connected") === "1") {
      setCalConnected(true);
      // Re-fetch own profile to get email
      const supabase = createClient();
      supabase.from("profiles").select("google_calendar_email").eq("id", currentUser.id).single().then(({ data }) => {
        if (data?.google_calendar_email) setCalEmail(data.google_calendar_email as string);
      });
    }
  }, [searchParams]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteDept, setInviteDept] = useState("");
  const [inviteDesignation, setInviteDesignation] = useState("");
  const [inviteManager, setInviteManager] = useState("");
  const [inviteAccessLevels, setInviteAccessLevels] = useState<AppModule[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Access level editor state (for existing members)
  const [editingAccess, setEditingAccess] = useState<Profile | null>(null);
  const [editAccessLevels, setEditAccessLevels] = useState<AppModule[]>([]);
  const [savingAccess, setSavingAccess] = useState(false);

  const supabase = createClient();

  async function saveAccessLevels() {
    if (!editingAccess) return;
    setSavingAccess(true);
    const { data } = await supabase.from("profiles")
      .update({ access_levels: editAccessLevels })
      .eq("id", editingAccess.id)
      .select().single();
    if (data) setMembers(members.map(m => m.id === editingAccess.id ? data as Profile : m));
    setSavingAccess(false);
    setEditingAccess(null);
  }

  async function inviteMember() {
    if (!inviteEmail.trim() || !inviteName.trim() || !invitePassword.trim()) return;
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        password: invitePassword,
        full_name: inviteName.trim(),
        role: inviteRole,
        department: inviteDept.trim() || null,
        designation: inviteDesignation.trim() || null,
        reporting_manager_id: inviteManager || null,
        access_levels: inviteAccessLevels,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      setMessage({ type: "error", text: result.error || "Failed to create user" });
      setSaving(false);
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", result.user.id).single();
    if (profile) setMembers([...members, profile as Profile]);

    setMessage({ type: "success", text: `User ${inviteEmail} created. They can log in immediately at bombaycontentcompany.com with the password you set.` });
    setSaving(false);
    setShowInvite(false);
    setInviteEmail(""); setInviteName(""); setInvitePassword(""); setInviteRole("member");
    setInviteDept(""); setInviteDesignation(""); setInviteManager(""); setInviteAccessLevels([]);
  }

  async function toggleRole(member: Profile) {
    const newRole = member.role === "admin" ? "member" : "admin";
    const { data } = await supabase.from("profiles").update({ role: newRole }).eq("id", member.id).select().single();
    if (data) setMembers(members.map((m) => m.id === member.id ? data as Profile : m));
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Admin Panel</h1>
              <p className="text-sm text-slate-400">Manage team members and access</p>
            </div>
          </div>
          <button onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            <UserPlus className="w-4 h-4" /> Add Member
          </button>
        </div>

        {/* Admin Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-6">
          <button onClick={() => setAdminTab("team")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${adminTab === "team" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}>
            <Users className="w-4 h-4" /> Team & Access
          </button>
          <button onClick={() => setAdminTab("hr")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${adminTab === "hr" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}>
            <Briefcase className="w-4 h-4" /> HR Management
          </button>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
            message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
          }`}>
            {message.type === "success" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {message.text}
          </div>
        )}

        {/* HR Management Tab */}
        {adminTab === "hr" && (
          <HRAdminClient adminProfile={currentUser} members={members} />
        )}

        {adminTab === "team" && (<>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Members", value: members.length, icon: Users, color: "indigo" },
            { label: "Admins", value: members.filter((m) => m.role === "admin").length, icon: Crown, color: "amber" },
            { label: "Team Members", value: members.filter((m) => m.role === "member").length, icon: User, color: "emerald" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`bg-${color}-50 border border-${color}-100 rounded-xl p-4`}>
              <div className={`w-8 h-8 bg-${color}-100 rounded-lg flex items-center justify-center mb-2`}>
                <Icon className={`w-4 h-4 text-${color}-600`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className={`text-xs text-${color}-600 font-medium`}>{label}</p>
            </div>
          ))}
        </div>

        {/* Google Calendar Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5 text-blue-600" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Google Calendar</h2>
              <p className="text-xs text-slate-400">Connect your calendar to see upcoming meetings in the Overview</p>
            </div>
          </div>

          {searchParams.get("cal_error") && (
            <div className="mb-3 flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {searchParams.get("cal_error") === "access_denied" ? "Calendar access was denied." : "Failed to connect calendar. Please try again."}
            </div>
          )}

          {calConnected ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Connected as <strong>{calEmail}</strong>
              </div>
              <a href="/api/auth/google-calendar"
                className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                Reconnect
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-500 flex-1">Connect your Google account to see upcoming meetings on your Overview.</p>
              <a href="/api/auth/google-calendar"
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shrink-0">
                <Link2 className="w-4 h-4" /> Connect Google Calendar
              </a>
            </div>
          )}
        </div>

        {/* Members Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-800">Team Members</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Name</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Email</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Role</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Joined</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Module Access</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                        {member.full_name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{member.full_name}</p>
                        {member.id === currentUser.id && <p className="text-xs text-indigo-500">You</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {member.email}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      member.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {member.role === "admin" ? <Crown className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {member.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-400">{formatDate(member.created_at)}</td>
                  <td className="px-5 py-3">
                    {member.role === "admin" ? (
                      <span className="text-xs text-indigo-400">All modules</span>
                    ) : (member.access_levels?.length ?? 0) > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(member.access_levels || []).map(mod => (
                          <span key={mod} className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                            {MODULE_LABELS[mod as AppModule]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300 italic">No access set</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditingAccess(member); setEditAccessLevels(member.access_levels || []); }}
                        className="text-xs text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Settings className="w-3 h-3" /> Access
                      </button>
                      {member.id !== currentUser.id && (
                        <button
                          onClick={() => toggleRole(member)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          Make {member.role === "admin" ? "Member" : "Admin"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        </>)}

        {/* Invite Modal */}
        {showInvite && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-fade-in">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">Add Team Member</h3>
                </div>
                <button onClick={() => setShowInvite(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                  <input value={inviteName} onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Priya Sharma"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                  <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="priya@bccmedia.com"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password</label>
                  <input type="password" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="They can change this after login"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
                    <input value={inviteDept} onChange={e => setInviteDept(e.target.value)}
                      placeholder="e.g. Social Media"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Designation</label>
                    <input value={inviteDesignation} onChange={e => setInviteDesignation(e.target.value)}
                      placeholder="e.g. Social Media Manager"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Reporting Manager</label>
                  <select value={inviteManager} onChange={e => setInviteManager(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">No reporting manager</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name} {m.designation ? `(${m.designation})` : ""}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">These fields will be locked and cannot be edited by the user.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <div className="flex gap-2">
                    {(["member", "admin"] as const).map((r) => (
                      <button key={r} onClick={() => setInviteRole(r)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          inviteRole === r ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                        }`}>
                        {r === "admin" ? "Admin" : "Member"}
                      </button>
                    ))}
                  </div>
                </div>
                {inviteRole === "member" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Module Access</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_MODULES.filter(m => m !== "admin_access").map(mod => {
                        const checked = inviteAccessLevels.includes(mod);
                        return (
                          <label key={mod} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${checked ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                            <input type="checkbox" checked={checked}
                              onChange={e => setInviteAccessLevels(prev => e.target.checked ? [...prev, mod] : prev.filter(m => m !== mod))}
                              className="w-3.5 h-3.5 rounded accent-indigo-600" />
                            <span className={`text-xs font-medium ${checked ? "text-indigo-700" : "text-slate-600"}`}>{MODULE_LABELS[mod]}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 p-5 border-t border-slate-100">
                <button onClick={() => setShowInvite(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={inviteMember}
                  disabled={saving || !inviteEmail.trim() || !inviteName.trim() || !invitePassword.trim()}
                  className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {saving ? "Creating…" : "Create Account"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Access Level Edit Modal */}
        {editingAccess && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div>
                  <h3 className="font-semibold text-slate-900">Module Access — {editingAccess.full_name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Choose which modules this user can access</p>
                </div>
                <button onClick={() => setEditingAccess(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-2">
                  {ALL_MODULES.map(mod => {
                    const checked = editAccessLevels.includes(mod);
                    return (
                      <label key={mod} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${checked ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                        <input type="checkbox" checked={checked}
                          onChange={e => setEditAccessLevels(prev => e.target.checked ? [...prev, mod] : prev.filter(m => m !== mod))}
                          className="w-3.5 h-3.5 rounded accent-indigo-600" />
                        <span className={`text-xs font-medium ${checked ? "text-indigo-700" : "text-slate-600"}`}>{MODULE_LABELS[mod]}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-3">Admins have full access regardless of this setting.</p>
              </div>
              <div className="flex gap-3 p-5 border-t border-slate-100">
                <button onClick={() => setEditingAccess(null)} className="flex-1 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button onClick={saveAccessLevels} disabled={savingAccess}
                  className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingAccess ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : <Check className="w-3.5 h-3.5" />}
                  Save Access
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
