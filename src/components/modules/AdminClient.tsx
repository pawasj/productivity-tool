"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { Shield, UserPlus, Users, Mail, Trash2, X, Check, RefreshCw, Crown, User } from "lucide-react";
import type { Profile } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface Props { members: Profile[]; currentUser: Profile; }

export default function AdminClient({ members: initialMembers, currentUser }: Props) {
  const [members, setMembers] = useState<Profile[]>(initialMembers);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [invitePassword, setInvitePassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const supabase = createClient();

  async function inviteMember() {
    if (!inviteEmail.trim() || !inviteName.trim() || !invitePassword.trim()) return;
    setSaving(true);
    setMessage(null);

    // Create user via Supabase auth admin (requires service role — using signUp here for simplicity)
    const { data, error } = await supabase.auth.signUp({
      email: inviteEmail.trim(),
      password: invitePassword,
      options: {
        data: { full_name: inviteName.trim(), role: inviteRole },
      },
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
      setSaving(false);
      return;
    }

    if (data.user) {
      // Upsert profile
      const { data: profile } = await supabase
        .from("profiles")
        .upsert({ id: data.user.id, email: inviteEmail.trim(), full_name: inviteName.trim(), role: inviteRole })
        .select().single();
      if (profile) setMembers([...members, profile as Profile]);
    }

    setMessage({ type: "success", text: `Invitation sent to ${inviteEmail}` });
    setSaving(false);
    setShowInvite(false);
    setInviteEmail(""); setInviteName(""); setInvitePassword(""); setInviteRole("member");
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

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
            message.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
          }`}>
            {message.type === "success" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {message.text}
          </div>
        )}

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
                    {member.id !== currentUser.id && (
                      <button
                        onClick={() => toggleRole(member)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Make {member.role === "admin" ? "Member" : "Admin"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
      </div>
    </div>
  );
}
